module.exports = {
  "rid": "io.picolabs.error",
  "meta": { "shares": ["getErrors"] },
  "global": function* (ctx) {
    ctx.scope.set("getErrors", ctx.KRLClosure(function* (ctx, getArg, hasArg) {
      return yield ctx.modules.get(ctx, "ent", "error_log");
    }));
  },
  "rules": {
    "error_handle": {
      "name": "error_handle",
      "select": {
        "graph": { "system": { "error": { "expr_0": true } } },
        "eventexprs": {
          "expr_0": function* (ctx, aggregateEvent) {
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
      "postlude": function* (ctx, fired) {
        if (fired) {
          yield ctx.modules.set(ctx, "ent", "error_log", yield ctx.callKRLstdlib("append", [
            yield ctx.modules.get(ctx, "ent", "error_log"),
            yield ctx.applyFn(yield ctx.modules.get(ctx, "event", "attrs"), ctx, [yield ctx.modules.get(ctx, "ent", "error_log")])
          ]));
        }
      }
    },
    "basic0": {
      "name": "basic0",
      "select": {
        "graph": { "error": { "basic": { "expr_0": true } } },
        "eventexprs": {
          "expr_0": function* (ctx, aggregateEvent) {
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
      "action_block": function* (ctx, runAction) {
        var fired = true;
        if (fired) {
          yield runAction(ctx, void 0, "send_directive", ["basic0"], []);
        }
        return fired;
      },
      "postlude": function* (ctx, fired) {
        if (fired) {
          yield ctx.raiseError(ctx, "info", "some info error");
        }
      }
    },
    "basic1": {
      "name": "basic1",
      "select": {
        "graph": { "error": { "basic": { "expr_0": true } } },
        "eventexprs": {
          "expr_0": function* (ctx, aggregateEvent) {
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
      "action_block": function* (ctx, runAction) {
        var fired = true;
        if (fired) {
          yield runAction(ctx, void 0, "send_directive", ["basic1"], []);
        }
        return fired;
      },
      "postlude": function* (ctx, fired) {
        if (fired) {
          yield ctx.raiseError(ctx, "info", "this should not fire, b/c basic0 stopped execution");
        }
      }
    }
  }
};