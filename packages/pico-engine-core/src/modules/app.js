var _ = require("lodash");
var ktypes = require("krl-stdlib/types");

//coerce the value into an array of key strings
var toKeyPath = function(path){
    if(!ktypes.isArray(path)){
        path = [path];
    }
    return _.map(path, function(key){
        return ktypes.toString(key);
    });
};

module.exports = function(core){
    return {
        get: function(ctx, id, callback){
            if(ktypes.isString(id)){
                core.db.getAppVar(ctx.rid, id, callback);
                return;
            }
            var key = id.key;
            var path = toKeyPath(id.path);
            core.db.getAppVar(ctx.rid, key, function(err, data){
                if(err) return callback(err);
                callback(null, _.get(data, path));
            });
        },
        set: function(ctx, id, value, callback){
            callback = _.ary(callback, 1);
            if(ktypes.isString(id)){
                core.db.putAppVar(ctx.rid, id, value, callback);
                return;
            }
            var key = id.key;
            var path = toKeyPath(id.path);
            core.db.getAppVar(ctx.rid, key, function(err, data){
                if(err) return callback(err);

                var val = _.set(data, path, value);

                core.db.putAppVar(ctx.rid, key, val, callback);
            });
        },
        del: function(ctx, id, callback){
            callback = _.ary(callback, 1);
            if(ktypes.isString(id)){
                core.db.delAppVar(ctx.rid, id, callback);
                return;
            }
            var key = id.key;
            var path = toKeyPath(id.path);
            core.db.getAppVar(ctx.rid, key, function(err, data){
                if(err) return callback(err);

                var val = _.omit(data, path);

                core.db.putAppVar(ctx.rid, key, val, callback);
            });
        },
    };
};
