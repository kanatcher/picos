var _ = require("lodash");
var declarationBlock = require("../utils/declarationBlock");

module.exports = function(ast, comp, e){
    var rules_obj = {};
    _.each(ast.rules, function(rule){
        if(_.has(rules_obj, rule.name.value)){
            throw comp.error(rule.name.loc, "Duplicate rule name: " + rule.name.value);
        }
        rules_obj[rule.name.value] = comp(rule);
    });
    var rs = {
        rid: comp(ast.rid)
    };
    if(ast.meta){
        rs.meta = comp(ast.meta);
    }
    if(!_.isEmpty(ast.global)){
        rs.global = e("genfn", ["ctx"], declarationBlock(ast.global, comp));
    }
    rs.rules = e("obj", rules_obj);
    return [
        e(";", e("=", e("id", "module.exports"), e("obj", rs)))
    ];
};
