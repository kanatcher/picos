module.exports = {
  "rid": "io.picolabs.key-used2",
  "meta": {
    "name": "key-used2",
    "description": "\nThis is a test file for a module that uses keys\n        ",
    "use": [
      {
        "kind": "module",
        "rid": "io.picolabs.key-defined",
        "alias": "io.picolabs.key-defined"
      },
      {
        "kind": "module",
        "rid": "io.picolabs.key-configurable",
        "alias": "api",
        "with": function* (ctx) {
          ctx.scope.set("key2", yield ctx.modules.get(ctx, "keys", "local_key"));
        }
      }
    ],
    "keys": { "local_key": "this key is defined inside the module" },
    "shares": [
      "getFoo",
      "getBar",
      "getBarN",
      "getQuux",
      "getQuuz",
      "getAPIKeys"
    ]
  },
  "global": function* (ctx) {
    ctx.scope.set("getFoo", ctx.mkFunction([], function* (ctx, args) {
      return yield ctx.modules.get(ctx, "keys", "foo");
    }));
    ctx.scope.set("getBar", ctx.mkFunction([], function* (ctx, args) {
      return yield ctx.modules.get(ctx, "keys", "bar");
    }));
    ctx.scope.set("getBarN", ctx.mkFunction(["name"], function* (ctx, args) {
      ctx.scope.set("name", args["name"]);
      return yield ctx.callKRLstdlib("get", [
        yield ctx.modules.get(ctx, "keys", "bar"),
        ctx.scope.get("name")
      ]);
    }));
    ctx.scope.set("getQuux", ctx.mkFunction([], function* (ctx, args) {
      return yield ctx.modules.get(ctx, "keys", "quux");
    }));
    ctx.scope.set("getQuuz", ctx.mkFunction([], function* (ctx, args) {
      return yield ctx.modules.get(ctx, "keys", "quuz");
    }));
    ctx.scope.set("getAPIKeys", ctx.mkFunction([], function* (ctx, args) {
      return yield ctx.applyFn(yield ctx.modules.get(ctx, "api", "getKeys"), ctx, []);
    }));
  },
  "rules": {}
};