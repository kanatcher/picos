ruleset io.picolabs.operators {
  meta {
    shares results
  }
  global {
    nothing = null
    some_string = "foo"
    results = {
      //universal
      "str_as_num": "100.25".as("Number"),
      "num_as_str": 1.05.as("String"),
      "regex_as_str": re#blah#i.as("String"),
      "isnull": [
        1.isnull(),
        some_string.isnull(),
        nothing.isnull()
      ],
      "typeof": [
        1.typeof(),
        some_string.typeof(),
        "hi".typeof(),
        [1, 2].typeof(),
        {"a": 1}.typeof(),
        re#foo#.typeof(),
        nothing.typeof(),
        null.typeof()
      ],
      //numbers
      "75.chr()": 75.chr(),
      "0.range(10)": 0.range(10),
      "0.sprintf(10)": 0.sprintf("< %d>"),
      //string
      ".capitalize()": "Hello World".capitalize(),
      ".decode()": "[3, 4, 5]".decode(),
      ".extract": "I like cheese".extract(re#(s.+).*(.ing)#),
      ".lc()": "Hello World".lc(),
      ".match true": "Something".match(re#^S.*g$#),
      ".match false": "Someone".match(re#^S.*g$#),
      ".ord()": "Hello".ord(),
      ".replace": "Hello William!".replace(re#will#, "Bill"),
      ".split": "a;b;c".split(re#;#),
      ".sprintf": "Jim".sprintf("Hello %s!"),
      ".substr(5)": "This is a string".substr(5),
      ".substr(5, 4)": "This is a string".substr(5, 4),
      ".substr(5, -5)": "This is a string".substr(5, -5),
      ".substr(25)": "This is a string".substr(25),
      ".uc()": "Hello World".uc()
    }
  }
}
