var _ = require("lodash");
var DB = require("./DB");
var cocb = require("co-callback");
var cuid = require("cuid");
var async = require("async");
var ktypes = require("krl-stdlib/types");
var runKRL = require("./runKRL");
var Modules = require("./modules");
var PicoQueue = require("./PicoQueue");
var Scheduler = require("./Scheduler");
var runAction = require("./runAction");
var cleanEvent = require("./cleanEvent");
var cleanQuery = require("./cleanQuery");
var krl_stdlib = require("krl-stdlib");
var getKRLByURL = require("./getKRLByURL");
var SymbolTable = require("symbol-table");
var EventEmitter = require("events");
var processEvent = require("./processEvent");
var processQuery = require("./processQuery");
var ChannelPolicy = require("./ChannelPolicy");
var RulesetRegistry = require("./RulesetRegistry");
var normalizeKRLArgs = require("./normalizeKRLArgs");
var DependencyResolver = require("dependency-resolver");

var applyFn = cocb.wrap(function*(fn, ctx, args){
    if(ktypes.isAction(fn)){
        throw new Error("actions can only be called in the rule action block");
    }
    if( ! ktypes.isFunction(fn)){
        throw new Error("Not a function");
    }
    return yield fn(ctx, args);
});

var log_levels = {
    "info": true,
    "debug": true,
    "warn": true,
    "error": true,
};

var krl_stdlib_wrapped = _.mapValues(krl_stdlib, function(fn, key){
    if(cocb.isGeneratorFunction(fn)){
        return cocb.wrap(fn);
    }
    return function(){
        return Promise.resolve(fn.apply(void 0, arguments));
    };
});

module.exports = function(conf){
    var db = DB(conf.db);
    _.each(db, function(val, key){
        if(_.isFunction(val)){
            db[key + "Yieldable"] = cocb.wrap(val);
        }
    });
    var host = conf.host;
    var rootRIDs = _.uniq(_.filter(conf.rootRIDs, _.isString));
    var compileAndLoadRuleset = conf.compileAndLoadRuleset;

    var core = {
        db: db,
        host: host,
        rsreg: RulesetRegistry()
    };

    var emitter = new EventEmitter();
    var modules = Modules(core, conf.modules);

    var mkCTX = function(ctx){
        ctx.getMyKey = (function(rid){
            //we do it this way so all the keys are not leaked out to other built in modules or rulesets
            return function(id){
                return core.rsreg.getKey(rid, id);
            };
        }(ctx.rid));//pass in the rid at mkCTX creation so it is not later mutated

        if(ctx.event){
            ctx.txn_id = ctx.event.txn_id;
        }
        if(ctx.query){
            ctx.txn_id = ctx.query.txn_id;
        }

        ctx.modules = modules;
        ctx.applyFn = applyFn;
        var pushCTXScope = function(ctx2){
            return mkCTX(_.assign({}, ctx2, {
                rid: ctx.rid,//keep your original rid
                scope: ctx.scope.push(),
            }));
        };
        ctx.mkFunction = function(param_order, fn){
            var fixArgs = _.partial(normalizeKRLArgs, param_order);
            var pfn = cocb.wrap(fn);
            return function(ctx2, args){
                return pfn(pushCTXScope(ctx2), fixArgs(args));
            };
        };
        ctx.mkAction = function(param_order, fn){
            var fixArgs = _.partial(normalizeKRLArgs, param_order);
            var pfn = cocb.wrap(fn);
            var actionFn = function(ctx2, args){
                return pfn(pushCTXScope(ctx2), fixArgs(args), runAction);
            };
            actionFn.is_an_action = true;
            return actionFn;
        };

        ctx.emit = function(type, val){
            var info = {};
            info.rid = ctx.rid;
            info.txn_id = ctx.txn_id;
            if(ctx.pico_id){
                info.pico_id = ctx.pico_id;
            }
            if(ctx.event){
                info.event = {
                    eci: ctx.event.eci,
                    eid: ctx.event.eid,
                    domain: ctx.event.domain,
                    type: ctx.event.type,
                    attrs: _.cloneDeep(ctx.event.attrs),
                };
                if(!info.eci){
                    info.eci = ctx.event.eci;
                }
            }
            if(ctx.query){
                info.query = {
                    eci: ctx.query.eci,
                    rid: ctx.query.rid,
                    name: ctx.query.name,
                    args: ctx.query.args
                };
                if(!info.rid){
                    info.rid = ctx.query.rid;
                }
                if(!info.eci){
                    info.eci = ctx.query.eci;
                }
            }
            //one reason `val` must come first is by convertion the "error"
            //event's first argument is the Error object. If `info` comes first
            //it will get confused thinking `info` is the error
            emitter.emit(type, val, info);
        };
        ctx.log = function(level, val){
            if(!_.has(log_levels, level)){
                throw new Error("Unsupported log level: " + level);
            }
            //this 'log-' prefix distinguishes user declared log events from other system generated events
            ctx.emit("log-" + level, val);
        };
        ctx.callKRLstdlib = function(fn_name, args){
            if(_.isArray(args)){
                args = [ctx].concat(args);
            }else{
                args[0] = ctx;
            }
            var fn = krl_stdlib_wrapped[fn_name];
            return fn.apply(void 0, args);
        };

        //don't allow anyone to mutate ctx on the fly
        Object.freeze(ctx);
        return ctx;
    };
    core.mkCTX = mkCTX;

    var initializeRulest = cocb.wrap(function*(rs){
        rs.scope = SymbolTable();
        rs.modules_used = {};
        core.rsreg.setupOwnKeys(rs);

        var use_array = _.values(rs.meta && rs.meta.use);
        var i, use, dep_rs, ctx2;
        for(i = 0; i < use_array.length; i++){
            use = use_array[i];
            if(use.kind !== "module"){
                throw new Error("Unsupported 'use' kind: " + use.kind);
            }
            dep_rs = core.rsreg.get(use.rid);
            if(!dep_rs){
                throw new Error("Dependant module not loaded: " + use.rid);
            }
            ctx2 = mkCTX({
                rid: dep_rs.rid,
                scope: SymbolTable()
            });
            if(_.isFunction(dep_rs.meta && dep_rs.meta.configure)){
                yield runKRL(dep_rs.meta.configure, ctx2);
            }
            if(_.isFunction(use["with"])){
                yield runKRL(use["with"], mkCTX({
                    rid: rs.rid,//switch rid
                    scope: ctx2.scope//must share scope
                }));
            }
            if(_.isFunction(dep_rs.global)){
                yield runKRL(dep_rs.global, ctx2);
            }
            rs.modules_used[use.alias] = {
                rid: use.rid,
                scope: ctx2.scope,
                provides: _.get(dep_rs, ["meta", "provides"], []),
            };
            core.rsreg.provideKey(rs.rid, use.rid);
        }
        var ctx = mkCTX({
            rid: rs.rid,
            scope: rs.scope
        });
        if(_.isFunction(rs.meta && rs.meta.configure)){
            yield runKRL(rs.meta.configure, ctx);
        }
        core.rsreg.put(rs);
        if(_.isFunction(rs.global)){
            yield runKRL(rs.global, ctx);
        }
    });

    var initializeAndEngageRuleset = function(rs, callback){
        initializeRulest(rs).then(function(){
            callback();
        }, function(err){
            process.nextTick(function(){
                //wrapping in nextTick resolves strange issues with UnhandledPromiseRejectionWarning
                //when infact we are handling the rejection
                callback(err);
            });
        });
    };

    var storeCompileAndEnable = function(krl_src, meta_data, callback){
        db.storeRuleset(krl_src, meta_data, function(err, data){
            if(err) return callback(err);
            compileAndLoadRuleset({
                rid: data.rid,
                src: krl_src,
                hash: data.hash
            }, function(err, rs){
                if(err) return callback(err);
                db.enableRuleset(data.hash, function(err){
                    callback(err, {rs: rs, hash: data.hash});
                });
            });
        });
    };

    core.registerRuleset = function(krl_src, meta_data, callback){
        storeCompileAndEnable(krl_src, meta_data, function(err, data){
            if(err) return callback(err);
            initializeAndEngageRuleset(data.rs, function(err){
                if(err){
                    db.disableRuleset(data.rs.rid, _.noop);//undo enable if failed
                }
                callback(err, {
                    rid: data.rs.rid,
                    hash: data.hash
                });
            });
        });
    };

    var picoQ = PicoQueue(function(pico_id, type, data, callback){
        //now handle the next task on the pico queue
        if(type === "event"){
            var event = data;
            event.timestamp = new Date(event.timestamp);//convert from JSON string to date
            processEvent(core, mkCTX({
                event: event,
                pico_id: pico_id
            }), callback);
        }else if(type === "query"){
            processQuery(core, mkCTX({
                query: data,
                pico_id: pico_id
            }), callback);
        }else{
            callback(new Error("invalid PicoQueue type:" + type));
        }
    });

    var picoTask = function(type, data_orig, callback_orig){
        var callback = _.isFunction(callback_orig) ? callback_orig : _.noop;
        var data;
        try{
            //validate + normalize event/query, and make sure is not mutated
            if(type === "event"){
                data = cleanEvent(data_orig);
                if(data.eid === "none"){
                    data.eid = cuid();
                }
            }else if(type === "query"){
                data = cleanQuery(data_orig);
            }else{
                throw new Error("invalid PicoQueue type:" + type);
            }
        }catch(err){
            emitter.emit("error", err);
            callback(err);
            return;
        }

        //events and queries have a txn_id and timestamp
        data.txn_id = cuid();
        data.timestamp = conf.___core_testing_mode && _.isDate(data_orig.timestamp)
            ? data_orig.timestamp
            : new Date();

        db.getChannelAndPolicy(data.eci, function(err, chann){
            if(err){
                emitter.emit("error", err);
                callback(err);
                return;
            }

            var pico_id = chann.pico_id;

            var emit = mkCTX({
                pico_id: pico_id,
                event: type === "event" ? data : void 0,
                query: type === "query" ? data : void 0,
            }).emit;

            emit("episode_start");
            if(type === "event"){
                emit("debug", "event received: " + data.domain + "/" + data.type);
            }else if(type === "query"){
                emit("debug", "query received: " + data.rid + "/" + data.name);
            }
            try{
                ChannelPolicy.assert(chann.policy, type, data);
            }catch(e){
                onDone(e);
                return;
            }

            picoQ.enqueue(pico_id, type, data, onDone);

            emit("debug", type + " added to pico queue: " + pico_id);

            function onDone(err, data){
                if(err){
                    emit("error", err);
                }else{
                    emit("debug", data);
                }
                //there should be no more emits after "episode_stop"
                emit("episode_stop");
                callback(err, data);
            }
        });
    };

    core.signalEvent = function(event, callback){
        picoTask("event", event, callback);
    };

    core.runQuery = function(query, callback){
        picoTask("query", query, callback);
    };

    var registerAllEnabledRulesets = function(system_rulesets, callback){

        var rs_by_rid = {};
        var resolver = new DependencyResolver();

        async.series([
            //
            // compile+store+enable system_rulesets first
            //
            function(nextStep){
                async.each(system_rulesets, function(system_ruleset, next){
                    storeCompileAndEnable(system_ruleset.src, system_ruleset.meta, next);
                }, nextStep);
            },


            //
            // load Rulesets and track dependencies
            //
            function(nextStep){
                var onRID = function(rid, next){
                    db.getEnabledRuleset(rid, function(err, data){
                        if(err) return next(err);
                        compileAndLoadRuleset({
                            rid: rid,
                            src: data.src,
                            hash: data.hash
                        }, function(err, rs){
                            if(err){
                                //Emit an error and don't halt the engine
                                var err2 = new Error("Failed to compile " + rid + "! It is now disabled. You'll need to edit and re-register it.\nCause: " + err);
                                err2.orig_error = err;
                                emitter.emit("error", err2, {rid: rid});
                                //disable the ruleset since it's broken
                                db.disableRuleset(rid, next);
                                return;
                            }
                            rs_by_rid[rs.rid] = rs;
                            resolver.add(rs.rid);
                            _.each(rs.meta && rs.meta.use, function(use){
                                if(use.kind === "module"){
                                    resolver.setDependency(rs.rid, use.rid);
                                }
                            });
                            next(null, rs);
                        });
                    });
                };
                db.listAllEnabledRIDs(function(err, rids){
                    if(err) return nextStep(err);
                    async.each(rids, onRID, nextStep);
                });
            },


            //
            // initialize Rulesets according to dependency order
            //
            function(nextStep){
                if(_.isEmpty(rs_by_rid)){
                    //resolver blows up if it's empty
                    nextStep();
                    return;
                }
                //order they need to be loaded in for dependencies to work
                var rid_order = resolver.sort();

                async.eachSeries(rid_order, function(rid, next){
                    var rs = rs_by_rid[rid];
                    initializeAndEngageRuleset(rs, function(err){
                        if(err){
                            //Emit an error and don't halt the engine
                            var err2 = new Error("Failed to initialize " + rid + "! It is now disabled. You'll need to edit and re-register it.\nCause: " + err);
                            err2.orig_error = err;
                            emitter.emit("error", err2, {rid: rid});
                            //disable the ruleset since it's broken
                            db.disableRuleset(rid, next);
                            return;
                        }
                        next();
                    });
                }, nextStep);
            },
        ], callback);
    };

    core.unregisterRuleset = function(rid, callback){
        //first assert rid is not depended on as a module
        try{
            core.rsreg.assertNoDependants(rid);
        }catch(err){
            callback(err);
            return;
        }
        db.isRulesetUsed(rid, function(err, is_used){
            if(err) return callback(err);
            if(is_used){
                callback(new Error("Unable to unregister \"" + rid + "\": it is installed on at least one pico"));
                return;
            }
            db.deleteRuleset(rid, function(err){
                if(err) return callback(err);

                core.rsreg.del(rid);

                callback();
            });
        });
    };

    core.scheduler = Scheduler({
        db: db,
        onError: function(err){
            var info = {scheduler: true};
            emitter.emit("error", err, info);
        },
        onEvent: function(event){
            core.signalEvent(event);
        },
        is_test_mode: !!conf.___core_testing_mode,
    });

    core.registerRulesetURL = function(url, callback){
        getKRLByURL(url, function(err, src){
            core.registerRuleset(src, {url: url}, callback);
        });
    };
    core.flushRuleset = function(rid, callback){
        db.getEnabledRuleset(rid, function(err, rs_data){
            if(err) return callback(err);
            var url = rs_data.url;
            if(!_.isString(url)){
                callback(new Error("cannot flush a locally registered ruleset"));
                return;
            }
            core.registerRulesetURL(url, callback);
        });
    };
    core.installRuleset = function(pico_id, rid, callback){
        db.assertPicoID(pico_id, function(err, pico_id){
            if(err) return callback(err);

            db.hasEnabledRid(rid, function(err, has){
                if(err) return callback(err);
                if(!has) return callback(new Error("This rid is not found and/or enabled: " + rid));

                db.addRulesetToPico(pico_id, rid, callback);
            });
        });
    };

    core.uninstallRuleset = function(pico_id, rid, callback){
        db.assertPicoID(pico_id, function(err, pico_id){
            if(err) return callback(err);

            db.removeRulesetFromPico(pico_id, rid, callback);
        });
    };

    var resumeScheduler = function(callback){
        db.listScheduled(function(err, vals){
            if(err) return callback(err);

            //resume the cron jobs
            _.each(vals, function(val){
                if(!_.isString(val.timespec)){
                    return;
                }
                core.scheduler.addCron(val.timespec, val.id, val.event);
            });

            //resume `schedule .. at` queue
            core.scheduler.update();

            callback();
        });
    };


    var pe = {
        emitter: emitter,

        signalEvent: core.signalEvent,
        runQuery: core.runQuery,

        getRootECI: function(callback){
            db.getRootPico(function(err, root_pico){
                if(err) return callback(err);
                callback(null, root_pico.admin_eci);
            });
        },

        /////////////////////
        // vvv deprecated vvv
        registerRuleset: core.registerRuleset,
        registerRulesetURL: core.registerRulesetURL,
        flushRuleset: core.flushRuleset,
        unregisterRuleset: core.unregisterRuleset,

        removeChannel: db.removeChannel,
        installRuleset: core.installRuleset,
        uninstallRuleset: core.uninstallRuleset,
        removePico: db.removePico,

        putEntVar: db.putEntVar,
        getEntVar: db.getEntVar,
        delEntVar: db.delEntVar,

        dbDump: db.toObj,
        // ^^^ deprecated ^^^
        /////////////////////
    };
    if(conf.___core_testing_mode){
        pe.newPico = db.newPico;
        pe.newPolicy = db.newPolicy;
        pe.newChannel = db.newChannel;
        pe.scheduler = core.scheduler;
        pe.modules = modules;
    }

    pe.start = function(system_rulesets, callback){
        async.series([
            db.checkAndRunMigrations,
            function(next){
                registerAllEnabledRulesets(system_rulesets, next);
            },
            function(next){
                if(_.isEmpty(rootRIDs)){
                    return next();
                }
                db.getRootPico(function(err, root_pico){
                    if(err && ! err.notFound){
                        return next(err);
                    }else if(!err){
                        return next();
                    }
                    db.newPico({}, next);
                });
            },
            function(next){
                if(_.isEmpty(rootRIDs)){
                    return next();
                }
                db.getRootPico(function(err, root_pico){
                    if(err) return next(err);

                    db.ridsOnPico(root_pico.id, function(err, rids){
                        if(err) return next(err);

                        var to_install = [];
                        _.each(rootRIDs, function(r_rid){
                            if( ! _.includes(rids, r_rid)){
                                to_install.push(r_rid);
                            }
                        });

                        async.eachSeries(to_install, function(rid, next){
                            core.installRuleset(root_pico.id, rid, next);
                        }, next);
                    });
                });
            },
            resumeScheduler,
        ], callback);
    };

    return pe;
};
