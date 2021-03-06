module.exports = {
  "rid": "io.picolabs.module-defined",
  "meta": {
    "provides": [
      "getInfo",
      "getName",
      "getInfoAction"
    ],
    "shares": ["getInfo"],
    "configure": function* (ctx) {
      ctx.scope.set("configured_name", "Bob");
    }
  },
  "global": function* (ctx) {
    ctx.scope.set("privateFn", ctx.mkFunction([], function* (ctx, args) {
      return yield ctx.callKRLstdlib("+", [
        yield ctx.callKRLstdlib("+", [
          yield ctx.callKRLstdlib("+", [
            "privateFn = name: ",
            ctx.scope.get("configured_name")
          ]),
          " memo: "
        ]),
        yield ctx.modules.get(ctx, "ent", "memo")
      ]);
    }));
    ctx.scope.set("getName", ctx.mkFunction([], function* (ctx, args) {
      return ctx.scope.get("configured_name");
    }));
    ctx.scope.set("getInfo", ctx.mkFunction([], function* (ctx, args) {
      return {
        "name": yield ctx.applyFn(ctx.scope.get("getName"), ctx, []),
        "memo": yield ctx.modules.get(ctx, "ent", "memo"),
        "privateFn": yield ctx.applyFn(ctx.scope.get("privateFn"), ctx, [])
      };
    }));
    ctx.scope.set("getInfoAction", ctx.mkAction([], function* (ctx, args, runAction) {
      var fired = true;
      if (fired) {
        yield runAction(ctx, void 0, "send_directive", [
          "getInfoAction",
          yield ctx.applyFn(ctx.scope.get("getInfo"), ctx, [])
        ], []);
      }
      return [{
          "name": yield ctx.callKRLstdlib("get", [
            yield ctx.applyFn(ctx.scope.get("getInfo"), ctx, []),
            ["name"]
          ])
        }];
    }));
  },
  "rules": {
    "store_memo": {
      "name": "store_memo",
      "select": {
        "graph": { "module_defined": { "store_memo": { "expr_0": true } } },
        "eventexprs": {
          "expr_0": function* (ctx, aggregateEvent, getAttrString) {
            var matches = [];
            var m;
            var j;
            m = new RegExp("^(.*)$", "").exec(getAttrString(ctx, "memo"));
            if (!m)
              return false;
            for (j = 1; j < m.length; j++)
              matches.push(m[j]);
            ctx.scope.set("text", matches[0]);
            return true;
          }
        },
        "state_machine": {
          "start": [[
              "expr_0",
              "end"
            ]]
        }
      },
      "body": function* (ctx, runAction, toPairs) {
        var fired = true;
        if (fired) {
          yield runAction(ctx, void 0, "send_directive", [
            "store_memo",
            {
              "name": ctx.scope.get("configured_name"),
              "memo_to_store": ctx.scope.get("text")
            }
          ], []);
        }
        if (fired)
          ctx.emit("debug", "fired");
        else
          ctx.emit("debug", "not fired");
        yield ctx.modules.set(ctx, "ent", "memo", yield ctx.callKRLstdlib("+", [
          yield ctx.callKRLstdlib("+", [
            yield ctx.callKRLstdlib("+", [
              yield ctx.callKRLstdlib("+", [
                "[\"",
                ctx.scope.get("text")
              ]),
              "\" by "
            ]),
            ctx.scope.get("configured_name")
          ]),
          "]"
        ]));
      }
    }
  }
};