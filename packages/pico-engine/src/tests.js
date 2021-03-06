var _ = require("lodash");
var fs = require("fs");
var cocb = require("co-callback");
var test = require("tape");
var path = require("path");
var async = require("async");
var tempfs = require("temp-fs");
var startCore = require("./startCore");
var setupServer = require("./setupServer");

var is_windows = /^win/.test(process.platform);//windows throws up when we try and delete the home dir
var test_temp_dir = tempfs.mkdirSync({
    dir: path.resolve(__dirname, ".."),
    prefix: "pico-engine_test",
    recursive: true,//It and its content will be remove recursively.
    track: !is_windows,//Auto-delete it on fail.
});

test.onFinish(function(){
    //cleanup temp home dirs after all tests are done
    if(!is_windows){
        test_temp_dir.unlink();
    }
});

var getHomePath = function(){
    var homepath = path.resolve(test_temp_dir.path, _.uniqueId());
    fs.mkdirSync(homepath);
    return homepath;
};

var testPE = function(name, testsFn){
    test(name, function(t){
        startCore({
            host: "http://fake-url",//tests don't actually setup http listening
            home: getHomePath(),
            no_logging: true,
        }, function(err, pe){
            if(err) return t.end(err);
            pe.getRootECI(function(err, root_eci){
                if(err) return t.end(err);

                if(cocb.isGeneratorFunction(testsFn)){
                    cocb.wrap(testsFn)(t, pe, root_eci).then(function(){
                        t.end();
                    }, function(err){
                        process.nextTick(function(){
                            t.end(err);
                        });
                    });
                }else{
                    testsFn(t, pe, root_eci);
                }
            });
        });
    });
};

testPE("pico-engine", function(t, pe, root_eci){
    var child_count, child, channels ,channel, /*bill,*/ ted, carl,installedRids,parent_eci;
    var subscriptionPicos = {};
    var SUBS_RID = "io.picolabs.subscription";
    // helper functions
    var testQuery = function( _name, _args, test, _eci, _rid, next){
        var _query= { eci: _eci || root_eci, rid : _rid || "io.picolabs.wrangler", name: _name, args: _args || {} };
        //console.log("_query",_query);
        pe.runQuery(_query,
            function(err, data){
                if(err) return next(err);
                test(data);
                next();
            });
    };
    var defaultQueryParams = function(_funcName, _args){
        return {
            eci: root_eci,
            rid: "io.picolabs.wrangler",
            name: _funcName,
            args: _args,
        };
    };

    //documentation for waterfall and passing params from one function to another:
    //https://caolan.github.io/async/docs.html#waterfall
    async.waterfall([
        ////////////////////////////////////////////////////////////////////////
        //
        //                      Wrangler tests
        //
        //TEST 1: This tests the wrangler:myself() function by querying the root pico and comparing
        //the received eci with the known eci for that pico
        function(next){ // example , call myself function check if eci is the same as root.
            console.log("//////////////////Wrangler Testing//////////////////");
            testQuery("myself",null,
                function(data){
                    //console.log("data",data);
                    t.equals(data.eci, root_eci);
                }, null, null , next );
        },
        ///////////////////////////////// channels testing ///////////////
        //TEST 2: This test is setting up for Test 4. Test 2 will query for all of the channels on
        //the root pico and then pass those channels to the next function. Test 3 will
        //attempt to create a new channel. Test 4 will make the actual comparison.
        function(next){
            pe.runQuery(defaultQueryParams("channel", {})
                , function(err, data){
                    if(err) return next(err);
                    t.equal(data.length > 0,true,"channels returns a list greater than zero");
                    next(null, data);//data is the array of channels. null as the first arg as per the waterfall docs (there is no error).
                });
        },
        //TEST 3: Create a new channel and store it in the newChannel variable. Pass both the
        //channels and newChannel variable on to the next function
        function(channels, next){// create channels
            pe.signalEvent({
                eci: root_eci,
                eid: "85",
                domain: "wrangler",
                type: "channel_creation_requested ",
                attrs: {name:"ted",type:"type"}
            }, function(err, response){
                if(err) return next(err);
                //console.log("this is the response of createChannel: ",response.directives[0].options);
                t.deepEqual(response.directives[0].options.name, "ted","correct directive");
                var createdChannel = response.directives[0].options;
                ted = createdChannel;
                next(null, channels, createdChannel, ted);
            });
        },
        //TEST 4: Query for the new list of channes and compare with the old list of channels
        //TEST 5: Make sure only 1 channel was created, not multiple channels
        function(previousChannels, createdChannel, ted, next){// compare with store,
            pe.runQuery(defaultQueryParams("channel", {}),
                function(err, currentChannels){
                    if(err) return next(err);
                    console.log("//////////////////Channel Creation//////////////////");
                    t.equals(currentChannels.length > previousChannels.length, true,"channel was created");
                    t.equals(currentChannels.length, previousChannels.length + 1,"single channel was created");
                    var found = false;
                    for(var i = 0; i < currentChannels.length; i++) {
                        if (currentChannels[i].id === createdChannel.id) {
                            found = true;
                            t.deepEqual(createdChannel, currentChannels[i],"new channel is the same channel from directive");
                            break;
                        }
                    }
                    t.equals(found, true,"found correct channel in deepEqual");//redundant check
                    next(null, currentChannels, ted);
                });
        },
        function(currentChannels, ted, next){// create duplicate channels
            pe.signalEvent({
                eci: root_eci,
                eid: "85",
                domain: "wrangler",
                type: "channel_creation_requested ",
                attrs: {name:"ted",type:"type"}
            }, function(err, response){
                if(err) return next(err);
                t.deepEqual(response.directives,[],"duplicate channel create");// I wish this directive was not empty on failure........
                next(null, currentChannels, ted);
            });
        },
        function(currentChannels, ted, next){// compare with store,
            pe.runQuery(defaultQueryParams("channel", {})
                , function(err, data){
                    if(err) return next(err);
                    t.equals(data.length, currentChannels.length,"no duplicate channel was created");
                    next(null, ted);
                });
        },
        function(ted, next){// create channel
            pe.signalEvent({
                eci: root_eci,
                eid: "85",
                domain: "wrangler",
                type: "channel_creation_requested ",
                attrs: {name:"carl",type:"typeC"}
            }, function(err, response){
                if(err) return next(err);
                //console.log("this is the response of createChannel: ",response.directives[0].options);
                //t.deepEqual(response.directives[0].options.channel.name, "carl","correct directive");
                channel = response.directives[0].options;
                carl = channel;
                next(null, ted);
            });
        },
        function(ted, next){// create channel
            pe.signalEvent({
                eci: root_eci,
                eid: "85",
                domain: "wrangler",
                type: "channel_creation_requested ",
                attrs: {name:"bill",type:"typeB"}
            }, function(err, response){
                if(err) return next(err);
                //console.log("this is the response of createChannel: ",response.directives[0].options);
                //t.deepEqual(response.directives[0].options.channel.name, "bill","correct directive");
                var billsChannel = response.directives[0].options;
                //bill = channel;
                next(null, billsChannel, ted);
            });
        },
        function(billsChannel, ted, next){// list channel given name,
            pe.runQuery(defaultQueryParams("channel", {value: billsChannel.name})
                ,function(err, data){
                    if(err) return next(err);
                    //console.log("Data in query: ", data);
                    t.equals(data.id,billsChannel.id,"list channel given name");
                    next(null, billsChannel, ted);
                });
        },
        function(billsChannel, ted, next){// list channel given eci,
            pe.runQuery(defaultQueryParams("channel", {value: billsChannel.id})
                ,function(err, data){
                    if(err) return next(err);
                    t.equals(data.id,billsChannel.id,"list channel given eci");
                    next(null, billsChannel, ted);
                });
        },
        function(billsChannel, ted, next){// list channels by collection,
            pe.runQuery(defaultQueryParams("channel", {collection:"type"})
                , function(err, data){
                    if(err) return next(err);
                    console.log("///////list collection of channel");
                    //console.log("Data in channel filter by collection: ", data);
                    t.equals(data["typeB"]  !== null , true ,"has typeB");
                    t.equals(data["typeC"]  !== null , true ,"has typeC");
                    t.equals(data["type"]   !== null , true ,"has type");
                    t.equals(data["secret"] !== null , true ,"has secret");
                    console.log("///////");
                    next(null, billsChannel, ted);
                });
        },
        function(billsChannel, ted, next){// list channels by filtered collection,
            pe.runQuery(defaultQueryParams("channel", {collection:"type",filtered:"typeB"})
                , function(err, data){
                    if(err) return next(err);
                    t.deepEquals(data.length>0, true ,"filtered collection has at least one channels");// should have at least one channel with this type..
                    t.deepEquals(data[0].type, billsChannel.type,"filtered collection of has correct type");// should have at least one channel with this type..
                    next(null, billsChannel, ted);
                });
        },
        function(billsChannel, ted, next){// alwaysEci,
            pe.runQuery(defaultQueryParams("alwaysEci", {value: billsChannel.id})
                , function(err, data){
                    if(err) return next(err);
                    //console.log("eci",data);
                    t.equals(data,billsChannel.id,"alwaysEci id");
                    next(null, ted);
                });
        },
        function(ted, next){// alwaysEci,
            pe.runQuery(defaultQueryParams("alwaysEci", {value:channel.name})
                ,function(err, data){
                    if(err) return next(err);
                    t.equals(data,channel.id,"alwaysEci name");
                    next(null, ted);
                });
        },
        function(ted, next){// eciFromName,
            pe.runQuery(defaultQueryParams("eciFromName", {name:channel.name})
                , function(err, data){
                    if(err) return next(err);
                    t.equals(data,channel.id,"eciFromName");
                    next(null, ted);
                });
        },
        function(ted, next){// nameFromEci,
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "nameFromEci",
                args: {eci:channel.id},
            }, function(err, data){
                if(err) return next(err);
                t.equals(data,channel.name,"nameFromEci");
                next(null, ted);
            });
        },
        function(ted, next){// store channels,
            pe.runQuery(
                defaultQueryParams("channel", {})
                , function(err, data){
                    if(err) return next(err);
                    channels = data;
                    next(null, channels, ted);
                });
        },
        function(currentChannels, ted, next){
            console.log("//////////////////Channel Deletion//////////////////");
            pe.signalEvent({
                eci: root_eci,
                eid: "85",
                domain: "wrangler",
                type: "channel_deletion_requested ",
                attrs: {name:"ted"}
            }, function(err, response){
                if(err) return next(err);
                //console.log("this is the response of channel_deletion_requested: ",response.directives[0].options);
                t.deepEqual(response.directives[0].options.name, "ted","correct deletion directive received");
                channel = response.directives[0].options;
                next(null, currentChannels, ted);
            });
        },
        function(currentChannels, ted, next){// compare with store,
            pe.runQuery(
                defaultQueryParams("channel", {})
                , function(err, data){
                    if(err) return next(err);
                    t.equals(data.length <= currentChannels.length, true,"channel was removed by name");
                    t.equals(data.length, currentChannels.length - 1 ,"single channel was removed by name");
                    var found = false;
                    for(var i = 0; i < data.length; i++) {
                        if (data[i].id === ted.id) {
                            found = true;
                            break;
                        }
                    }
                    t.equals(found, false,"correct channel removed");
                    channels = data;// store channels,
                    next(null);
                });
        },
        function(next){
            pe.signalEvent({
                eci: root_eci,
                eid: "85",
                domain: "wrangler",
                type: "channel_deletion_requested ",
                attrs: {eci:carl.id}
            }, function(err, response){
                if(err) return next(err);
                //console.log("this is the response of channel_deletion_requested: ",response.directives[0].options);
                t.deepEqual(response.directives[0].options.name, "carl","correct directive");
                channel = response.directives[0].options;
                next();
            });
        },
        function(next){// compare with store,
            pe.runQuery(
                defaultQueryParams("channel", {})
                ,function(err, data){
                    if(err) return next(err);
                    t.equals(data.length <= channels.length, true,"channel was removed by eci");
                    t.equals(data.length, channels.length - 1 ,"single channel was removed by eci");
                    var found = false;
                    for(var i = 0; i < data.length; i++) {
                        if (data[i].id === carl.id) {
                            found = true;
                            break;
                        }
                    }
                    t.equals(found, false,"correct channel removed");
                    next();
                });
        },

        ///////////////////////////////// rulesets tests ///////////////
        function(next){// store installed rulesets,
            console.log("//////////////////Install single ruleset //////////////////");
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "installedRulesets",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                //console.log("data from rids query: ", data);
                installedRids = data;
                t.equal(installedRids.length > 0, true, "installed rids list is greater than zero");
                next();
            });
        },
        function(next){// attempt to install logging
            pe.signalEvent({
                eci: root_eci,
                eid: "94",
                domain: "wrangler",
                type: "install_rulesets_requested ",
                attrs: {rids:"io.picolabs.logging"}
            }, function(err, response){
                if(err) return next(err);
                //console.log("this is the response of install_rulesets_requested: ",response);
                t.deepEqual("io.picolabs.logging", response.directives[0].options.rids[0], "correct directive");
                //rids = response.directives[0].options.rids;
                next();
            });
        },
        function(next){// confirm installed rid,
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "installedRulesets",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                var found = false;
                t.equals(data.length >= installedRids.length, true,"ruleset was installed");
                t.equals(data.length, installedRids.length + 1 ,"single ruleset was installed");
                for(var i = 0; i < data.length; i++) {
                    if (data[i] === "io.picolabs.logging") {
                        found = true;
                        break;
                    }
                }
                t.equals(found, true,"correct ruleset installed");
                next();
            });
        },
        function(next){// attempt to Un-install logging
            console.log("//////////////////Un-Install single ruleset //////////////////");
            pe.signalEvent({
                eci: root_eci,
                eid: "94",
                domain: "wrangler",
                type: "uninstall_rulesets_requested ",
                attrs: {rids:"io.picolabs.logging"}
            }, function(err, response){
                if(err) return next(err);
                //console.log("this is the response of uninstall_rulesets_requested: ",response.directives[0].options);
                t.deepEqual("io.picolabs.logging", response.directives[0].options.rids[0],"correct directive");
                next();
            });
        },
        function(next){// confirm un-installed rid,
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "installedRulesets",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                var found = false;
                t.equals(data.length <= installedRids.length, true,"ruleset was un-installed");
                t.equals(data.length, installedRids.length  ,"single ruleset was un-installed");
                for(var i = 0; i < data.length; i++) {
                    if (data[i] === "io.picolabs.logging") {
                        found = true;
                        break;
                    }
                }
                t.equals(found, false,"correct ruleset un-installed");
                next();
            });
        },
        function(next){// attempt to install logging & subscriptions
            console.log("//////////////////Install two rulesets //////////////////");
            pe.signalEvent({
                eci: root_eci,
                eid: "94",
                domain: "wrangler",
                type: "install_rulesets_requested ",
                attrs: {rids:"io.picolabs.logging;io.picolabs.subscription"}
            }, function(err, response){
                if(err) return next(err);
                //console.log("this is the response of install_rulesets_requested: ",response.directives[0].options);
                t.deepEqual(["io.picolabs.logging","io.picolabs.subscription"], response.directives[0].options.rids, "correct directive");
                //rids = response.directives[0].options.rids;
                next();
            });
        },
        function(next){// confirm two installed rids,
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "installedRulesets",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                var found = 0;
                t.equals(data.length >= installedRids.length, true,"rulesets installed");
                t.equals(data.length, installedRids.length + 2 ,"two rulesets were installed");
                for(var i = 0; i < data.length; i++) {
                    if (data[i] === "io.picolabs.logging"|| data[i] === "io.picolabs.subscription") {
                        found ++;
                        //break;
                    }
                    if (data[i] === "io.picolabs.logging"){
                        t.deepEqual(data[i], "io.picolabs.logging","logging installed");
                    }
                    else if (data[i] === "io.picolabs.subscription"){
                        t.deepEqual(data[i], "io.picolabs.subscription","subscription installed");
                    }
                }
                t.equals(found, 2,"both rulesets installed");
                next();
            });
        },
        function(next){// attempt to Un-install logging & subscriptions
            console.log("////////////////// Un-Install two rulesets //////////////////");
            pe.signalEvent({
                eci: root_eci,
                eid: "94",
                domain: "wrangler",
                type: "uninstall_rulesets_requested ",
                attrs: {rids:"io.picolabs.logging;io.picolabs.subscription"}
            }, function(err, response){
                if(err) return next(err);
                //console.log("this is the response of uninstall_rulesets_requested: ",response.directives[0].options);
                t.deepEqual(["io.picolabs.logging","io.picolabs.subscription"], response.directives[0].options.rids, "correct directive");
                next();
            });
        },
        function(next){// confirm un-installed rid,
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "installedRulesets",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                var found = 0;
                t.equals(data.length <= installedRids.length, true,"rulesets un-installed");
                t.equals(data.length, installedRids.length  ,"two rulesets un-installed");
                for(var i = 0; i < data.length; i++) {
                    if (data[i] === "io.picolabs.logging"|| data[i] === "io.picolabs.subscription") {
                        found ++;
                        //break;
                    }
                }
                t.equals(found > 0, false ,"correct rulesets un-installed");
                next();
            });
        },
        ///////////////////////////////// rulesets info tests ///////////////
        function(next){// rule set info,
            console.log("////////////////// describe one rule set //////////////////");
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "rulesetsInfo",
                args: {rids:"io.picolabs.logging"},
            }, function(err, data){
                if(err) return next(err);
                //console.log("rulesetInfo",data.description);
                t.deepEqual(data.length, 1 ,"single rule set described");
                t.deepEqual("io.picolabs.logging",data[0].rid ,"correct ruleset described");
                t.equals(data[0].src !== undefined ,true,"has a src");
                next();
            });
        },
        function(next){// rule set info,
            console.log("////////////////// describe two rule sets //////////////////");
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "rulesetsInfo",
                args: {rids:"io.picolabs.logging;io.picolabs.subscription"},
            }, function(err, data){
                if(err) return next(err);
                //console.log("rulesetInfo",data);
                t.deepEqual(data.length, 2 ,"two rule sets described");
                t.deepEqual("io.picolabs.logging",data[0].rid ,"logging ruleset described");
                t.equals(data[0].src !== undefined ,true,"logging has a src");
                t.deepEqual("io.picolabs.subscription",data[1].rid ,"subscription ruleset described");
                t.equals(data[1].src !== undefined ,true,"subscription has a src");
                next();
            });
        },
        ///////////////////////////////// Register rule sets tests ///////////////
        ///wrangler does not have rules for this..
        ///it does have a function to list registered rule sets

        ///////////////////////////////// create child tests ///////////////
        function(next){// store created children
            console.log("//////////////////Create Child Pico//////////////////");
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "children",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                child_count = data.length;
                t.equal(Array.isArray(data), true,"children returns list.");
                next();
            });
        },
        function(next){// create child
            pe.signalEvent({
                eci: root_eci,
                eid: "84",
                domain: "wrangler",
                type: "new_child_request",
                attrs: {name:"ted"}
            }, function(err, response){
                //console.log("children",response);
                if(err) return next(err);
                t.deepEqual("ted", response.directives[0].options.pico.name, "correct directive");
                child = response.directives[0].options.pico; //store child information from event for deleting
                next();
            });
        },
        function(next){// list children and check for new child
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "children",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                //console.log("children",data);
                t.equals(data.length > child_count, true,"created a pico"); // created a child
                t.equals(data.length , child_count+1, "created a single pico"); // created only 1 child
                var found = false;
                for(var i = 0; i < data.length; i++) {
                    if (data[i].id === child.id) {
                        found = true;
                        t.deepEqual(child, data[i],"new pico is the same pico from directive");
                        break;
                    }
                }
                t.deepEqual(found, true,"new child pico found");//check that child is the same from the event above
                next();
            });
        },
        function(next){ // channel in parent created?
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "channel",
                args: {value:"ted"},
            }, function(err, data){
                if(err) return next(err);
                //console.log("parent_eci",data);
                t.equals(data.name,"ted","channel for child created in parent");
                parent_eci = data.id;
                next();
            });
        },
        function(next){ // parent channel stored in child?
            pe.runQuery({
                eci: child.eci,
                rid: "io.picolabs.wrangler",
                name: "parent_eci", args:{},
            }, function(err, data){
                if(err) return next(err);
                //console.log("parent_eci",data);
                t.equals(data,parent_eci,"parent channel for child stored in child");
                next();
            });
        },
        function(next){
            pe.runQuery({
                eci: child.eci,
                rid: "io.picolabs.wrangler",
                name: "channel",
                args: {value:"main"},
            }, function(err, data){
                if(err) return next(err);
                t.equals(data.name,"main","child 'main' channel created");
                next();
            });
        },
        function(next){
            pe.runQuery({
                eci: child.eci,
                rid: "io.picolabs.wrangler",
                name: "channel",
                args: {value:"admin"},
            }, function(err, data){
                if(err) return next(err);
                t.equals(data.name,"admin","child 'admin' channel created");
                next();
            });
        },
        function(next){// create duplicate child
            pe.signalEvent({
                eci: root_eci,
                eid: "84",
                domain: "wrangler",
                type: "new_child_request",
                attrs: {name:"ted"}
            }, function(err, response){
                //console.log("children",response);
                if(err) return next(err);
                t.deepEqual("Pico_Created", response.directives[0].name, "correct directive for duplicate child creation");
                next();
            });
        },
        function(next){// create child with no name(random)
            pe.signalEvent({
                eci: root_eci,
                eid: "84",
                domain: "wrangler",
                type: "new_child_request",
                attrs: {}
            }, function(err, response){
                //console.log("children",response);
                if(err) return next(err);
                t.deepEqual("Pico_Created", response.directives[0].name, "correct directive for random named child creation");
                next();
            });
        },/*
        function(next){
            console.log("//////////////////Simple Pico Child Deletion//////////////////");
            pe.signalEvent({
                eci: root_eci,
                eid: "85",
                domain: "wrangler",
                type: "delete_child_request_by_pico_id",
                attrs: {name:"ted"}
            }, function(err, response){
                if(err) return next(err);
                console.log("this is the response of children_deletion_requested: ",response);
                console.log("engine: ",pe);
                //t.deepEqual(response.directives[0].options.channel.name, "ted","correct directive");
                //channel = response.directives[0].options.channel;
                next();
            });
        },
        function(next){// compare with store,
            pe.runQuery({
                eci: root_eci,
                rid: "io.picolabs.wrangler",
                name: "children",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                console.log("data: ",data);
                next();
            });
        },*/

        ///////////////////////////////// Subscription tests ///////////////
        ///////////////// Subscription Request tests
        // create two children , A,B
        // install subscription rulesets
        // create well known DID's
        // send subscriptions request from A to B
        // check for created channel in Child A
        // check for created subscription in Child A
        // check for created channel in Child B ?
        // check for created subscription in Child B ?
        // check status of subscription A is pending
        // check status of subscription B is pending
        // check attrs are correct .... ?
        function(next){// create picoA for subscription tests
            console.log("////////////////// Subscription Pending Tests //////////////////");
            pe.signalEvent({
                eci: root_eci, eid: "84", domain: "wrangler", type: "new_child_request",
                attrs: {name:"A", rids: SUBS_RID}
            }, function(err, response){
                subscriptionPicos["picoA"] = response.directives[0].options.pico;
                next();
            });
        },
        function(next){// create picoB for subscription tests
            pe.signalEvent({
                eci: root_eci, eid: "84", domain: "wrangler", type: "new_child_request",
                attrs: {name:"B", rids: SUBS_RID}
            }, function(err, response){
                subscriptionPicos["picoB"] = response.directives[0].options.pico;
                next();
            });
        },
        function(next){ //createSubscription
            pe.signalEvent({
                eci: subscriptionPicos["picoB"].eci, eid: "subscription", domain: "wrangler", type: "subscription",
                attrs: {
                    "name": "A",
                    "channel_type": "subscription",
                    "wellKnown_Tx": subscriptionPicos["picoA"].eci
                }
            }, function(err, response){
                next();
            });
        },
        function(next){
            pe.runQuery({
                eci: subscriptionPicos["picoB"].eci,
                rid: SUBS_RID,
                name: "outbound",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                data = data[0];
                //console.log("outbound subs",data);
                subscriptionPicos.picoB.subscriptions = data;
                t.notEqual(undefined, data, "Pico B has outbound pending subscription");
                t.notEqual(undefined, data.wellKnown_Tx, "Pico B pending has wellKnown_Tx");
                t.notEqual(undefined, data.Rx, "Pico B pending has Rx");
                next();
            });
        },
        function(next){
            pe.runQuery({
                eci: subscriptionPicos["picoA"].eci,
                rid: SUBS_RID,
                name: "inbound",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                data = data[0];
                //console.log("inbound subs",data);
                subscriptionPicos.picoA.subscriptions = data;
                t.notEqual(undefined, data, "Pico A has inbound pending subscription");
                t.notEqual(undefined, data.Tx_verify_key, "Pico A pending has Tx_verify_key");
                t.notEqual(undefined, data.Tx_public_key, "Pico A pending has Tx_public_key");
                t.notEqual(undefined, data.Tx, "Pico A pending has Tx");
                t.notEqual(undefined, data.Rx, "Pico A pending has Rx");
                next();
            });
        },
        //////////////// Subscription Accept tests
        function(next){ //accept Subscription
            console.log("////////////////// Subscription Acceptance Tests //////////////////");
            pe.signalEvent({
                eci: subscriptionPicos.picoA.subscriptions.Rx, eid: "accept", domain: "wrangler", type: "pending_subscription_approval",
                attrs: {}
            }, function(err, response){
                next();
            });
        },
        function(next){ // check subscriptions
            pe.runQuery({
                eci: subscriptionPicos["picoB"].eci,
                rid: SUBS_RID,
                name: "established",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                data = data[0];
                //console.log("outbound established subs",data);
                subscriptionPicos.picoB.subscriptions = data;
                t.notEqual(undefined, data, "Pico B has established subscription");
                next();
            });
        },
        function(next){
            pe.runQuery({
                eci: subscriptionPicos["picoA"].eci,
                rid: SUBS_RID,
                name: "established",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                data = data[0];
                //console.log("inbound established subs",data);
                subscriptionPicos.picoA.subscriptions = data;
                t.notEqual(undefined, data, "Pico A has established subscription");
                next();
            });
        },
        function(next){ // check Pico A subscriptions
            console.log("////////////////// Secure Subscription Tests //////////////////");
            pe.runQuery({
                eci: subscriptionPicos["picoA"].eci,
                rid: "io.picolabs.wrangler",
                name: "channel",
                args: {value: subscriptionPicos.picoA.subscriptions.Rx },
            }, function(err, data){
                if(err) return next(err);
                //console.log("subscription A channel",data,subscriptionPicos.picoB.subscriptions);
                t.equal(subscriptionPicos.picoB.subscriptions.Tx, data.sovrin.did, "Pico A has Pico B did");
                t.equal(subscriptionPicos.picoB.subscriptions.Tx_verify_key, data.sovrin.verifyKey, "Pico A has Pico B verifyKey");
                t.equal(subscriptionPicos.picoB.subscriptions.Tx_public_key, data.sovrin.encryptionPublicKey, "Pico A has Pico B encryptionPublicKey");
                next();
            });
        },
        function(next){ // check Pico B subscriptions
            pe.runQuery({
                eci: subscriptionPicos["picoB"].eci,
                rid: "io.picolabs.wrangler",
                name: "channel",
                args: {value: subscriptionPicos.picoB.subscriptions.Rx },
            }, function(err, data){
                if(err) return next(err);
                //console.log("subscription B channel",data,subscriptionPicos.picoA.subscriptions);
                t.equal(subscriptionPicos.picoA.subscriptions.Tx, data.sovrin.did, "Pico B has Pico A did");
                t.equal(subscriptionPicos.picoA.subscriptions.Tx_verify_key, data.sovrin.verifyKey, "Pico B has Pico A verifyKey");
                t.equal(subscriptionPicos.picoA.subscriptions.Tx_public_key, data.sovrin.encryptionPublicKey, "Pico B has Pico A encryptionPublicKey");
                next();
            });
        },
        function(next) { // register and install test ruleset
            var picoA = subscriptionPicos["picoA"];
            var picoB = subscriptionPicos["picoB"];
            readFile("krl/test/subscription_tests/mischief.krl").then(function(data) { //console.log("opened mischief ruleset");
                return registerRuleset(data);
            }).then(function(response) { //console.log("registered mischief ruleset");
                return readFile("krl/test/subscription_tests/mischief.thing.krl");
            }).then(function(data) { //console.log("opened mischief.thing ruleset");
                return registerRuleset(data);
            }).then(function(response) { //console.log("registered mischief.thing ruleset");
                return installRulesets(picoA.eci, "mischief");
            }).then(function (installResponse) {//console.log("installed mischief ruleset");
                return installRulesets(picoB.eci, "mischief.thing");
            }).then(function(){//console.log("installed mischief.thing ruleset");
                next();
            }).catch(function(err) {
                next(err);
            });
        },
        function(next){ // start mischief
            console.log("start mischief event to",subscriptionPicos["picoA"].eci);
            pe.signalEvent({
                eci: subscriptionPicos["picoA"].eci, eid: "123", domain: "mischief", type: "hat_lifted",
                attrs: {}
            }, function(err, response){
                //console.log("start mischief event directive",response);
                next();
            });
        },
        function(next){
            pe.runQuery({
                eci: subscriptionPicos["picoB"].eci,
                rid: "mischief.thing",
                name: "ents",
                args: { },
            }, function(err, data){
                if(err) return next(err);
                //console.log("ents",data);
                var failed = data.failed;
                var message = data.message;
                t.deepEqual(message, {test: 1}, "Successfully sent, received, and verified signed message");
                t.equal(failed, 1, "Successfully dealt with failed signature verification");
                next();
            });
        },
        function(next){
            pe.signalEvent({
                eci: subscriptionPicos["picoA"].eci, eid: "321", domain: "mischief", type: "encrypted",
                attrs: {}
            }, function(err, response){
                next();
            });
        },/* sharedSecret is not currently accessible except for scraping the data base, so the following test will not work.
        function(next){
            pe.runQuery({
                eci: subscriptionPicos["picoA"].eci,
                rid: "io.picolabs.wrangler",
                name: "channel",
                args: {value: subscriptionPicos.picoA.subscriptions.Rx },
            }, function(err, data){
                if(err) return next(err);
                console.log("subscription A channel",data);
                //t.notEqual(undefined, data.sovrin.secret.sharedSecret, "Shared secret A is not undefined");
                next(null,data.sovrin);
            });
        },
        function(sharedSecretA, next){
            pe.runQuery({
                eci: subscriptionPicos["picoB"].eci,
                rid: "io.picolabs.wrangler",
                name: "channel",
                args: {value: subscriptionPicos.picoB.subscriptions.Rx },
            }, function(err, data){
                if(err) return next(err);
                console.log("subscription B channel",data);
                //t.notEqual(undefined, data.sovrin.secret.sharedSecret, "Shared secret B is not undefined");
                //t.equal(sharedSecretA, data.sovrin.secret.sharedSecret, "Shared secrets are the same");
                next();
            });
        },*/
        function(next){
            pe.runQuery({
                eci: subscriptionPicos["picoB"].eci,
                rid: "mischief.thing",
                name: "ents",
                args: { },
            }, function(err, data){
                if(err) return next(err);
                //console.log("ents",data);
                var message = data.decrypted_message;
                var decryptionFailed = data.decryption_failure;
                t.deepEqual(message, {encryption: 1}, "Successfully sent, received, and decrypted encrypted message");
                t.equal(decryptionFailed, 1, "Properly handled failed decryption");
                next();
            });
        },
        function(next) {
            console.log("////////////////// Subscription Rejection Tests //////////////////");
            createChild("C",  SUBS_RID).then(function(pico) {
                subscriptionPicos["picoC"] = pico;
                return installRulesets(pico.eci, SUBS_RID);
            }).then(function(installResponse) {
                return createChild("D");
            }).then(function(pico) {
                subscriptionPicos["picoD"] = pico;
                return installRulesets(pico.eci, SUBS_RID);
            }).then(function(installResponse) {
                return createSubscription(subscriptionPicos["picoC"].eci, subscriptionPicos["picoD"].eci, "B");
            }).then(function(response) {
                next();
            }).catch(function(err) {
                next(err);
            });
        },
        function(next){
            pe.runQuery({
                eci: subscriptionPicos["picoC"].eci,
                rid: SUBS_RID,
                name: "inbound",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                //console.log("inbound subs",data);
                next(null,data[0].Rx);
            });
        },
        function(Rx, next){
            pe.signalEvent({
                eci: Rx, eid: "3214", domain: "wrangler", type: "inbound_rejection",
                attrs: {}
            }, function(err, response){
                next();
            });
        },
        function(next){
            pe.runQuery({
                eci: subscriptionPicos["picoC"].eci,
                rid: SUBS_RID,
                name: "inbound",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                t.equal(undefined, data[0], "Inbound rejecting subscriptions worked");
                next();
            });
        },
        function(next){
            pe.runQuery({
                eci: subscriptionPicos["picoD"].eci,
                rid: SUBS_RID,
                name: "outbound",
                args: {},
            }, function(err, data){
                if(err) return next(err);
                t.equal(undefined, data[0], "outbound removed from inbound rejecting subscriptions worked");
                next();
            });
        },
        //
        //                      end Wrangler tests
        //
        ////////////////////////////////////////////////////////////////////////
    ], function(err){
        t.end(err);
    });

    function installRulesets (eci, rulesets) {
        return new Promise(function(resolve, reject) {
            pe.signalEvent({
                eci: eci,
                domain: "wrangler",
                type: "install_rulesets_requested ",
                attrs: {rids: rulesets}
            }, function(err, response) {
                err ? reject(err) : resolve(response);
            });
        });
    }
    function createChild (name) {
        return new Promise(function(resolve, reject) {
            pe.signalEvent({
                eci: root_eci,
                eid: "84",
                domain: "wrangler",
                type: "new_child_request",
                attrs: {name: name}
            }, function(err, response){
                err ? reject(err) : resolve(response.directives[0].options.pico);
            });
        });
    }
    function readFile(filePath, encoding) {
        encoding = encoding ? encoding : "utf8";
        return new Promise(function (resolve, reject) {
            fs.readFile(filePath, encoding, function (err, data) {
                err ? reject(err) : resolve(data);
            });
        });
    }
    function registerRuleset (krlSource) {
        return new Promise(function(resolve, reject) {
            pe.registerRuleset(krlSource, null, function(err, response){
                err ? reject(err) : resolve(response);
            });
        });
    }
    function createSubscription (eci1, eci2, name) {
        return new Promise(function(resolve, reject) {
            var attrs = {
                "name": name,
                "channel_type": "subscription",
                "wellKnown_Tx": eci1
            };
            pe.signalEvent({
                eci: eci2,
                eid: "subscription",
                domain: "wrangler",
                type: "subscription",
                attrs: attrs
            }, function(err, response){
                err ? reject(err) : resolve(response);
            });
        });
    }
});

testPE("pico-engine - setupServer", function(t, pe, root_eci){
    //simply setup, but don't start, the express server
    //make sure it doesn't throwup
    try{
        setupServer(pe);
        t.ok("setupServer worked");
    }catch(e){
        t.error(e, "Failed to setupServer");
    }
    t.end();
});

testPE("pico-engine - Wrangler", function*(t, pe, root_eci){

    var yQuery = cocb.wrap(function(eci, rid, name, args, callback){
        pe.runQuery({
            eci: eci,
            rid: rid,
            name: name,
            args: args || {},
        }, callback);
    });
    var yEvent = cocb.wrap(function(eci, domain_type, attrs, eid, callback){
        domain_type = domain_type.split("/");
        pe.signalEvent({
            eci: eci,
            eid: eid || "85",
            domain: domain_type[0],
            type: domain_type[1],
            attrs: attrs || {}
        }, callback);
    });

    var data;
    var channel;
    var channels;

    // call myself function check if eci is the same as root.
    data = yield yQuery(root_eci, "io.picolabs.wrangler", "myself", {});
    t.equals(data.eci, root_eci);


    //// channels testing ///////////////

    // store channels, we don't directly test list channels.......
    data = yield yQuery(root_eci, "io.picolabs.wrangler", "channel", {});
    t.equal(data.length > 0, true,"channels returns a list greater than zero");
    channels = data;

    // create channels
    data = yield yEvent(root_eci, "wrangler/channel_creation_requested", {name:"ted", type:"type"});
    //console.log("Data: ", data.directives[0].options);
    channel = data.directives[0].options;
    t.equal(channel.name, "ted", "correct directive");

    // compare with store,
    data = yield yQuery(root_eci, "io.picolabs.wrangler", "channel", {});
    t.equals(data.length > channels.length, true, "channel was created");
    t.equals(data.length, channels.length + 1, "single channel was created");
    var found = false;
    for(var i = 0; i < data.length; i++) {
        if (data[i].id === channel.id) {
            found = true;
            t.deepEqual(channel, data[i], "new channel is the same channel from directive");
            break;
        }
    }
    t.equals(found, true,"found correct channel in deepEqual");//redundant check
    channels = data; // update channels cache

    //TODO rest
});
