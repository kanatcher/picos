var _ = require("lodash");
var phonetic = require("phonetic");
var default_grammar = new require("../src/grammar.js");

var gen = {
    "RulesetID": function(){
        return "karl42.picolabs.io";
    },
    "Identifier": function(){
        return phonetic.generate();
    },
    "Keyword": function(){
        return phonetic.generate();
    },
    "String": function(){
        return JSON.stringify(phonetic.generate());
    },
    "RegExp": function(){
        return "re#(.*)#";
    },
    "Number": function(){
        return _.random(-100, 100, true) + "";
    },
    "PositiveInteger": function(){
        return _.random(0, 100) + "";
    },
    "PersistentVariable": function(){
        return _.sample(["app", "ent"]) + ":" + phonetic.generate();
    },
};

var isParenRule = function(rule){
    if(_.size(rule && rule.symbols) !== 3){
        return false;
    }
    var s = rule.symbols;
    if(!s[0] || s[0].unparse_hint_value !== "("){
        return false;
    }
    if(s[1] !== "Expression"){
        return false;
    }
    if(!s[2] || s[2].unparse_hint_value !== ")"){
        return false;
    }
    return true;
};

var isOptionalSemiColon = function(rules){
    if(rules.length !== 2){
        return false;
    }
    if((rules[0].symbols.length + rules[1].symbols.length) !== 1){
        return false;
    }
    var semi_rule = rules[0].symbols.length > 0
        ? rules[0]
        : rules[1];
    return semi_rule.symbols[0].unparse_hint_value === ";";
};

var isOptionalActionBlock = function(rules){
    if(rules.length !== 2){
        return false;
    }
    if((rules[0].symbols.length + rules[1].symbols.length) !== 1){
        return false;
    }
    var da_rule = rules[0].symbols.length > 0
        ? rules[0]
        : rules[1];
    return da_rule.symbols[0] === "ActionBlock";
};

module.exports = function(options){
    options = options || {};

    var grammar = options.grammar || default_grammar;
    var start = options.start || grammar.ParserStart;
    var always_semicolons = _.has(options, "always_semicolons")
        ? options.always_semicolons
        : false;

    var stack = [start];
    var output = "";
    var stop_recusive_rules = false;

    var selectRule = function(currentname){
        var rules = grammar.ParserRules.filter(function(x) {
            return x.name === currentname;
        });
        if(rules.length === 0){
            throw new Error("Nothing matches rule: "+currentname+"!");
        }
        if(isOptionalSemiColon(rules)){
            if(always_semicolons){
                return {symbols: [{literal: ";"}]};
            }
        }
        if(isOptionalActionBlock(rules)){
            //always do an action block to avoid some strange ambiguities with event aggregator
            return {symbols: ["ActionBlock"]};
        }
        return _.sample(_.filter(rules, function(rule){
            if(isParenRule(rule)){
                return false;
            }
            if(stop_recusive_rules || stack.length > 25){
                return !_.includes(rule.symbols, currentname);
            }
            return true;
        }));
    };

    var count = 0;

    while(stack.length > 0){
        count++;
        if(!stop_recusive_rules && count > 500){
            stop_recusive_rules = true;
        }
        var currentname = stack.pop();
        if(currentname === "left_side_of_declaration"){
        //if(currentname === "PrimaryExpression"){
            currentname = "Identifier";
        }
        if(gen[currentname]){
            stack.push({literal: gen[currentname]()});
        }else if(currentname === "Chevron"){
            stack.push({literal: "<<hello #{"});
            stack.push("Expression");
            stack.push({literal: "}!>>"});
        }else if(typeof currentname === "string"){
            _.each(selectRule(currentname).symbols, function(symbol){
                stack.push(symbol);
            });

        }else if(currentname.unparse_hint_value){
            output = " " + currentname.unparse_hint_value + " " + output;
        }else if(_.has(currentname, "unparse_hint_enum")){
            output = " " + _.sample(currentname.unparse_hint_enum) + " " + output;
        }else if(currentname.unparse_hint_type === "SYMBOL"){
            output = " " + phonetic.generate() + " " + output;
        }else if(currentname.literal){
            output = currentname.literal + " " + output;
        }else{
            throw new Error("Unsupported: " + JSON.stringify(currentname));
        }
    }

    return output;
};
