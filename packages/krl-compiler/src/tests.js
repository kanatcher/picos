var _ = require("lodash");
var λ = require("contra");
var fs = require("fs");
var diff = require("diff-lines");
var path = require("path");
var test = require("tape");
var compiler = require("./");

var files_dir = path.resolve(__dirname, "../../../test-rulesets");

test("compiler", function(t){
    fs.readdir(files_dir, function(err, files){
        if(err) return t.end(err);

        var basenames = _.uniq(_.map(files, function(file){
            return path.basename(path.basename(file, ".krl"), ".js");
        }));

        λ.each(basenames, function(basename, next){
            var f_js = path.join(files_dir, basename) + ".js";
            var f_krl = path.join(files_dir, basename) + ".krl";
            λ.concurrent({
                js: λ.curry(fs.readFile, f_js, "utf-8"),
                krl: λ.curry(fs.readFile, f_krl, "utf-8")
            }, function(err, srcs){
                if(err) return t.end(err);

                var compiled;
                try{
                    compiled = compiler(srcs.krl).code;
                }catch(e){
                    console.log(f_krl);
                    console.log(e.stack);
                    process.exit(1);//end asap, so they can easily see the error
                }
                compiled = compiled.trim();
                var expected = srcs.js.trim();

                if(compiled === expected){
                    t.ok(true);
                    next();
                }else{
                    console.log("");
                    console.log(path.basename(f_krl) + " -> " + path.basename(f_js));
                    console.log("");
                    console.log(diff(expected, compiled, {
                        n_surrounding: 3
                    }));
                    console.log("");
                    console.log(path.basename(f_krl) + " -> " + path.basename(f_js));
                    process.exit(1);//end asap, so they can easily see the diff
                }

                next();
            });
        }, t.end);
    });
});

test("compiler errors", function(t){

    var tstFail = function(src, errorMsg){
        try{
            compiler(src);
            t.fail("Should fail: " + errorMsg);
        }catch(err){
            t.equals(err + "", errorMsg);
        }
    };

    var tstWarn = function(src, warning){
        var out = compiler(src);
        t.equals(out.warnings.length, 1);
        t.equals(out.warnings[0].message, warning);
    };
    try{
        compiler("ruleset blah {global {ent:a = 1}}\n");
        t.fail("should have thrown up b/c ent:* = * not allowed in global scope");
    }catch(err){
        t.ok(true);
    }

    try{
        compiler("function(){a = 1}");
        t.fail("function must end with an expression");
    }catch(err){
        t.equals(err + "", "Error: function must end with an expression");
    }

    try{
        compiler("ruleset a{meta{keys b {\"one\":function(){}}}}");
        t.fail("meta key maps can only have strings");
    }catch(err){
        t.equals(err + "", "Error: A ruleset key that is Map, can only use Strings as values");
    }

    tstFail(
        "ruleset a{rule b{select when a b} rule c{select when a c} rule b{}}",
        "Error: Duplicate rule name: b"
    );

    tstWarn(
        "ruleset a{global{b=1;c=3;b=1}}",
        "Duplicate declaration: b"
    );
    tstWarn(
        "ruleset a{rule b{select when a b pre{b=1;c=3;b=1}}}",
        "Duplicate declaration: b"
    );
    tstWarn(
        "ruleset a{global{act=defaction(){noop()};act=1}}",
        "Duplicate declaration: act"
    );

    tstFail(
        "ruleset a{global{ent:foo=1}}",
        "Error: Cannot declare DomainIdentifier"
    );
    tstFail(
        "ruleset a{global{null=1}}",
        "Error: Cannot declare Null"
    );
    tstFail(
        "ruleset a{global{true=1}}",
        "Error: Cannot declare Boolean"
    );
    tstFail(
        "ruleset a{global{\"hi\"=1}}",
        "Error: Cannot declare String"
    );

    tstFail(
        "ruleset a{global{b=function(c,d,c){1}}}",
        "Error: Duplicate parameter: c"
    );
    tstFail(
        "ruleset a{global{b=function(c,d=1,e){1}}}",
        "Error: Cannot have a non-default parameter after a defaulted one"
    );
    tstFail(
        "add(b = 1, 2)",
        "Error: Once you used a named arg, all following must be named."
    );
    tstWarn(
        "add.foo",
        "DEPRECATED use `{}` or `[]` instead of `.`"
    );
    tstWarn(
        "event:attrs()",
        "DEPRECATED change `event:attrs()` to `event:attrs`"
    );
    tstWarn(
        "keys:foo()",
        "DEPRECATED change `keys:foo()` to `keys:foo`"
    );
    tstWarn(
        "keys:foo(\"hi\")",
        "DEPRECATED change `keys:foo(name)` to `keys:foo{name}`"
    );

    t.end();
});

test("special cases", function(t){
    //args shouldn't be dependent on each other and cause strange duplication
    var js = compiler("foo(1).bar(baz(2))").code;
    var expected = "";
    expected += "yield ctx.callKRLstdlib(\"bar\", [\n";
    expected += "  yield ctx.applyFn(ctx.scope.get(\"foo\"), ctx, [1]),\n";
    expected += "  yield ctx.applyFn(ctx.scope.get(\"baz\"), ctx, [2])\n";
    expected += "]);";
    t.equals(js, expected);
    t.end();
});
