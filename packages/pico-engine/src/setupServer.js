var _ = require("lodash");
var path = require("path");
var express = require("express");
var bodyParser = require("body-parser");
var compiler = require("krl-compiler");
var version = require("../package.json").version;
var oauth_server = require("./oauth_server");
var mime = require("mime-types");

var mergeGetPost = function(req){
    //give preference to post body params
    return _.assign({}, req.query, req.body);
};

module.exports = function(pe){

    var app = express();
    app.use(function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        next();
    });
    app.use(express.static(path.resolve(__dirname, "..", "public")));
    app.use(bodyParser.json({type: "application/json"}));
    app.use(bodyParser.urlencoded({limit: "512mb", type: "application/x-www-form-urlencoded", extended: false}));

    var errResp = function(res, err){
        var code = 500;
        if(_.isNumber(err.statusCode)){
            code = err.statusCode;
        }else if(err && err.notFound){
            code = 404;
        }
        res.status(code).json({error: err.message});
    };

    app.use(function(err, req, res, next){
        errResp(res, err);
    });
    app.use(function(req, res, next){ // needed by oauth_server
        req.pe = pe;
        req.errResp = errResp;
        next();
    });
    app.use(function(req, res, next){ // root pico lookup of rewrites
        var result = /^(\/[A-Za-z0-9_.-]+)(\/.*)/.exec(req.url);
        if(!result) return(next());
        var fpc = result[1];
        if(fpc === "/sky" || fpc === "/api"
        || fpc === "/authorize" || fpc === "/approve" || fpc === "/token"
        || fpc === "/login" || fpc === "/new-account"){
            next();
        } else {
            console.log("[SEEK SHORTCUT] "+fpc);
            pe.getRootECI(function(err, root_eci){
                if(err) return errResp(res, err);
                var query = {
                    eci: root_eci,
                    rid: "io.picolabs.rewrite",
                    name: "getRewrite",
                    args: {fpc: fpc}
                };
                pe.runQuery(query, function(err, data){
                    if(data) {
                        var eventOrQuery =
                            data.kind==="event" ? "/sky/event/" : "/sky/cloud/";
                        req.url = eventOrQuery + data.eci + fpc + result[2];
                        console.log("[RE-WRITE] "+req.url);
                    } else {
                        console.log("[NO DATA]");
                    }
                    next();
                });
            });
        }
    });

    app.all("/sky/event/:eci/:eid/:domain/:type", function(req, res){
        var event = {
            eci: req.params.eci,
            eid: req.params.eid,
            domain: req.params.domain,
            type: req.params.type,
            attrs: mergeGetPost(req)
        };
        pe.signalEvent(event, function(err, response){
            if(err) return errResp(res, err);
            res.json(response);
        });
    });

    app.all("/sky/cloud/:eci/:rid/:function", function(req, res){
        var funcPart = req.params["function"].split(".");
        var respType = mime.contentType(funcPart[1]);
        var query = {
            eci: req.params.eci,
            rid: req.params.rid,
            name: funcPart[0],
            args: mergeGetPost(req)
        };
        pe.runQuery(query, function(err, data){
            if(err) return errResp(res, err);
            if(_.isFunction(data)){
                data(res);
            }else if(respType && funcPart[1] !== "json"){
                res.header("Content-Type", respType);
                res.end(data);
            }else{
                res.json(data);
            }
        });
    });

    app.get("/authorize", oauth_server.authorize);

    app.post("/approve", oauth_server.approve);

    app.post("/token", oauth_server.token);

    app.post("/new-account", oauth_server.new_account);

    app.post("/login", oauth_server.login);

    app.all("/api/engine-version", function(req, res){
        res.json({"version": version});
    });

    var toLegacyPVar = function(val){
        var value = val && val.value;
        if(!value && val){
            if(val.type === "Map"){
                value = {};
            }else if(val.type === "Array"){
                value = [];
            }
        }
        return value;
    };

    app.all("/api/db-dump", function(req, res){
        pe.dbDump(function(err, db_data){
            if(err) return errResp(res, err);

            if(req.query.legacy){
                _.each(db_data.appvars, function(vars, rid){
                    _.each(vars, function(val, name){
                        _.set(db_data, ["resultset", rid, "vars", name], toLegacyPVar(val));
                    });
                });
                _.each(db_data.entvars, function(by_rid, pico_id){
                    _.each(by_rid, function(vars, rid){
                        _.each(vars, function(val, name){
                            _.set(db_data, ["pico", pico_id, rid, "vars", name], toLegacyPVar(val));
                        });
                    });
                });
                _.each(db_data["pico-children"], function(children, pico_id){
                    _.set(db_data, [
                        "pico",
                        pico_id,
                        "io.picolabs.wrangler",
                        "vars",
                        "children"
                    ], _.map(children, function(val, id){
                        return {
                            id: id,
                            eci: _.get(db_data, ["pico", id, "admin_eci"]),
                        };
                    }));
                });

                _.each(db_data.channel, function(chan, eci){
                    _.set(db_data, ["pico", chan.pico_id, "channel", eci], chan);
                    _.set(db_data, ["channel", eci, "pico_id"], chan.pico_id);
                });
                _.each(db_data["pico-ruleset"], function(data, pico_id){
                    _.each(data, function(val, rid){
                        _.set(db_data, ["pico", pico_id, "ruleset", rid], val);
                    });
                });
            }


            res.json(db_data);
        });
    });

    app.all("/api/root-eci", function(req, res){
        pe.getRootECI(function(err, root_eci){
            if(err) return errResp(res, err);
            res.json({ok: true, eci: root_eci});
        });
    });

    app.all("/api/pico/:id/rm-channel/:eci", function(req, res){
        pe.removeChannel(req.params.eci, function(err){
            if(err) return errResp(res, err);
            res.json({ok: true});
        });
    });

    app.all("/api/pico/:id/rm-ruleset/:rid", function(req, res){
        pe.uninstallRuleset(req.params.id, req.params.rid, function(err){
            if(err) return errResp(res, err);
            res.json({ok: true});
        });
    });

    app.all("/api/pico/:id/rm-ent-var/:rid/:var_name", function(req, res){
        pe.delEntVar(req.params.id, req.params.rid, req.params.var_name, null, function(err){
            if(err) return errResp(res, err);
            res.json({ok: true});
        });
    });

    app.all("/api/ruleset/compile", function(req, res){
        var args = mergeGetPost(req);

        try{
            res.json({ok: true, code: compiler(args.src).code});
        }catch(err){
            res.status(400).json({ error: err.toString() });
        }
    });

    app.all("/api/ruleset/register", function(req, res){
        var args = mergeGetPost(req);

        var onRegister = function(err, data){
            if(err) return errResp(res, err);
            res.json({ok: true, rid: data.rid, hash: data.hash});
        };
        if(_.isString(args.src)){
            pe.registerRuleset(args.src, {}, onRegister);
        }else if(_.isString(args.url)){
            pe.registerRulesetURL(args.url, onRegister);
        }else{
            errResp(res, new Error("expected `src` or `url`"));
        }
    });

    app.all("/api/ruleset/flush/:rid", function(req, res){
        pe.flushRuleset(req.params.rid, function(err, data){
            if(err) return errResp(res, err);
            console.log("Ruleset successfully flushed: " + data.rid);
            res.json({ok: true, rid: data.rid, hash: data.hash});
        });
    });

    app.all("/api/ruleset/unregister/:rid", function(req, res){
        pe.unregisterRuleset(req.params.rid, function(err){
            if(err) return errResp(res, err);
            res.json({ok: true});
        });
    });

    app.all("/api/ruleset-page", function(req, res){
        pe.dbDump(function(err, db_data){
            if(err) return errResp(res, err);
            var data = {
                version: version,
                r: {},
            };

            _.each(_.get(db_data, ["rulesets", "versions"]), function(versions, rid){
                _.each(versions, function(hashes, date){
                    _.each(hashes, function(val, hash){
                        var rs = _.get(db_data, ["rulesets", "krl", hash]);
                        _.set(data, ["r", rid, "by_hash", hash], rs);
                        if(hash === _.get(db_data, ["rulesets", "enabled", rid, "hash"])){
                            _.set(data, ["r", rid, "enabled_hash"], hash);
                        }
                    });
                });

                var latest_hash = _.get(_.head(
                    _(versions)
                        .map(function(hashes, date){
                            return {date: new Date(date), hash: _.head(_.keys(hashes))};
                        })
                        .sortBy("date")
                        .reverse()
                        .value()
                ), "hash");

                _.set(data, ["r", rid, "rid"], rid);
                _.set(data, ["r", rid, "latest_hash"], latest_hash);

                //TODO based off pe.start(system_rulesets)
                _.set(data, ["r", rid, "is_system_ruleset"], /^io\.picolabs/.test(rid));
            });

            data.ruleset_list = _(data.r)
                .groupBy(function(rs){
                    return rs.is_system_ruleset
                        ? "sys"
                        : "usr";
                })
                .mapValues(function(list){
                    return _.sortBy(_.map(list, function(rs){
                        return {
                            rid: rs.rid,
                            not_enabled: !_.isString(rs.enabled_hash),
                        };
                    }), "rid");
                })
                .value();

            data.ok = true;
            res.json(data);
        });
    });

    return app;
};
