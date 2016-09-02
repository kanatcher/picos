module.exports = {
  "name": "io.picolabs.events",
  "meta": {},
  "rules": {
    "set_attr": {
      "name": "set_attr",
      "select": {
        "graph": { "events": { "bind": { "expr_0": true } } },
        "eventexprs": {
          "expr_0": function (ctx) {
            var matches = ctx.event.getAttrMatches([[
                "name",
                new RegExp("^(.*)$", "")
              ]]);
            if (!matches)
              return false;
            ctx.scope.set("my_name", matches[0]);
            return true;
          }
        },
        "state_machine": {
          "start": [
            [
              "expr_0",
              "end"
            ],
            [
              [
                "not",
                "expr_0"
              ],
              "start"
            ]
          ]
        }
      },
      "action_block": {
        "actions": [function (ctx) {
            return {
              "type": "directive",
              "name": "bound",
              "options": { "name": ctx.scope.get("my_name") }
            };
          }]
      }
    },
    "get_attr": {
      "name": "get_attr",
      "select": {
        "graph": { "events": { "get": { "expr_0": true } } },
        "eventexprs": {
          "expr_0": function (ctx) {
            return true;
          }
        },
        "state_machine": {
          "start": [
            [
              "expr_0",
              "end"
            ],
            [
              [
                "not",
                "expr_0"
              ],
              "start"
            ]
          ]
        }
      },
      "prelude": function (ctx) {
        ctx.scope.set("thing", ctx.event.getAttr("thing"));
      },
      "action_block": {
        "actions": [function (ctx) {
            return {
              "type": "directive",
              "name": "get",
              "options": { "thing": ctx.scope.get("thing") }
            };
          }]
      }
    },
    "noop": {
      "name": "noop",
      "select": {
        "graph": { "events": { "noop": { "expr_0": true } } },
        "eventexprs": {
          "expr_0": function (ctx) {
            return true;
          }
        },
        "state_machine": {
          "start": [
            [
              "expr_0",
              "end"
            ],
            [
              [
                "not",
                "expr_0"
              ],
              "start"
            ]
          ]
        }
      }
    },
    "noop2": {
      "name": "noop2",
      "select": {
        "graph": { "events": { "noop2": { "expr_0": true } } },
        "eventexprs": {
          "expr_0": function (ctx) {
            return true;
          }
        },
        "state_machine": {
          "start": [
            [
              "expr_0",
              "end"
            ],
            [
              [
                "not",
                "expr_0"
              ],
              "start"
            ]
          ]
        }
      },
      "action_block": {
        "actions": [function (ctx) {
            return void 0;
          }]
      }
    },
    "or_op": {
      "name": "or_op",
      "select": {
        "graph": {
          "events_or": {
            "a": { "expr_0": true },
            "b": { "expr_1": true }
          }
        },
        "eventexprs": {
          "expr_0": function (ctx) {
            return true;
          },
          "expr_1": function (ctx) {
            return true;
          }
        },
        "state_machine": {
          "start": [
            [
              "expr_0",
              "end"
            ],
            [
              "expr_1",
              "end"
            ],
            [
              [
                "not",
                [
                  "or",
                  "expr_0",
                  "expr_1"
                ]
              ],
              "start"
            ]
          ]
        }
      },
      "action_block": {
        "actions": [function (ctx) {
            return {
              "type": "directive",
              "name": "or",
              "options": {}
            };
          }]
      }
    },
    "and_op": {
      "name": "and_op",
      "select": {
        "graph": {
          "events_and": {
            "a": { "expr_0": true },
            "b": { "expr_1": true }
          }
        },
        "eventexprs": {
          "expr_0": function (ctx) {
            return true;
          },
          "expr_1": function (ctx) {
            return true;
          }
        },
        "state_machine": {
          "start": [
            [
              "expr_0",
              "state_0"
            ],
            [
              "expr_1",
              "state_1"
            ],
            [
              [
                "not",
                [
                  "or",
                  "expr_0",
                  "expr_1"
                ]
              ],
              "start"
            ]
          ],
          "state_0": [
            [
              "expr_1",
              "end"
            ],
            [
              [
                "not",
                "expr_1"
              ],
              "state_0"
            ]
          ],
          "state_1": [
            [
              "expr_0",
              "end"
            ],
            [
              [
                "not",
                "expr_0"
              ],
              "state_1"
            ]
          ]
        }
      },
      "action_block": {
        "actions": [function (ctx) {
            return {
              "type": "directive",
              "name": "and",
              "options": {}
            };
          }]
      }
    },
    "and_or": {
      "name": "and_or",
      "select": {
        "graph": {
          "events_andor": {
            "a": { "expr_0": true },
            "b": { "expr_1": true },
            "c": { "expr_2": true }
          }
        },
        "eventexprs": {
          "expr_0": function (ctx) {
            return true;
          },
          "expr_1": function (ctx) {
            return true;
          },
          "expr_2": function (ctx) {
            return true;
          }
        },
        "state_machine": {
          "start": [
            [
              "expr_0",
              "state_0"
            ],
            [
              "expr_1",
              "state_1"
            ],
            [
              "expr_2",
              "end"
            ],
            [
              [
                "not",
                [
                  "or",
                  "expr_0",
                  [
                    "or",
                    "expr_1",
                    "expr_2"
                  ]
                ]
              ],
              "start"
            ]
          ],
          "state_0": [
            [
              "expr_1",
              "end"
            ],
            [
              [
                "not",
                "expr_1"
              ],
              "state_0"
            ]
          ],
          "state_1": [
            [
              "expr_0",
              "end"
            ],
            [
              [
                "not",
                "expr_0"
              ],
              "state_1"
            ]
          ]
        }
      },
      "action_block": {
        "actions": [function (ctx) {
            return {
              "type": "directive",
              "name": "(a and b) or c",
              "options": {}
            };
          }]
      }
    },
    "or_and": {
      "name": "or_and",
      "select": {
        "graph": {
          "events_orand": {
            "a": { "expr_0": true },
            "b": { "expr_1": true },
            "c": { "expr_2": true }
          }
        },
        "eventexprs": {
          "expr_0": function (ctx) {
            return true;
          },
          "expr_1": function (ctx) {
            return true;
          },
          "expr_2": function (ctx) {
            return true;
          }
        },
        "state_machine": {
          "start": [
            [
              "expr_0",
              "state_0"
            ],
            [
              [
                "or",
                "expr_1",
                "expr_2"
              ],
              "state_1"
            ],
            [
              [
                "not",
                [
                  "or",
                  "expr_0",
                  [
                    "or",
                    "expr_1",
                    "expr_2"
                  ]
                ]
              ],
              "start"
            ]
          ],
          "state_0": [
            [
              [
                "or",
                "expr_1",
                "expr_2"
              ],
              "end"
            ],
            [
              [
                "not",
                [
                  "or",
                  "expr_1",
                  "expr_2"
                ]
              ],
              "state_0"
            ]
          ],
          "state_1": [
            [
              "expr_0",
              "end"
            ],
            [
              [
                "not",
                "expr_0"
              ],
              "state_1"
            ]
          ]
        }
      },
      "action_block": {
        "actions": [function (ctx) {
            return {
              "type": "directive",
              "name": "a and (b or c)",
              "options": {}
            };
          }]
      }
    },
    "ifthen": {
      "name": "ifthen",
      "select": {
        "graph": { "events": { "ifthen": { "expr_0": true } } },
        "eventexprs": {
          "expr_0": function (ctx) {
            var matches = ctx.event.getAttrMatches([[
                "name",
                new RegExp("^(.*)$", "")
              ]]);
            if (!matches)
              return false;
            ctx.scope.set("my_name", matches[0]);
            return true;
          }
        },
        "state_machine": {
          "start": [
            [
              "expr_0",
              "end"
            ],
            [
              [
                "not",
                "expr_0"
              ],
              "start"
            ]
          ]
        }
      },
      "action_block": {
        "condition": function (ctx) {
          return ctx.scope.get("my_name");
        },
        "actions": [function (ctx) {
            return {
              "type": "directive",
              "name": "ifthen",
              "options": {}
            };
          }]
      }
    },
    "on_fired": {
      "name": "on_fired",
      "select": {
        "graph": { "events": { "on_fired": { "expr_0": true } } },
        "eventexprs": {
          "expr_0": function (ctx) {
            var matches = ctx.event.getAttrMatches([[
                "name",
                new RegExp("^(.*)$", "")
              ]]);
            if (!matches)
              return false;
            ctx.scope.set("my_name", matches[0]);
            return true;
          }
        },
        "state_machine": {
          "start": [
            [
              "expr_0",
              "end"
            ],
            [
              [
                "not",
                "expr_0"
              ],
              "start"
            ]
          ]
        }
      },
      "action_block": {
        "actions": [function (ctx) {
            return {
              "type": "directive",
              "name": "on_fired",
              "options": { "previous_name": ctx.persistent.getEnt("on_fired_prev_name") }
            };
          }]
      },
      "postlude": {
        "fired": function (ctx) {
          ctx.persistent.putEnt("on_fired_prev_name", ctx.scope.get("my_name"));
        },
        "notfired": undefined,
        "always": undefined
      }
    }
  }
};