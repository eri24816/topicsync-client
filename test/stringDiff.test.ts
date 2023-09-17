import * as assert  from "assert";
import * as diff from "../src/stringDiff";

describe("insert string", () => {
    describe("in the middle", () => {
      it("should return the string after insertion", () => {
          assert.equal(diff.insert("abc", 1, "xx"), "axxbc")
      })
    })
    describe("at the beginning", () => {
        it("should return the string after insertion", () => {
            assert.equal(diff.insert("abc", 0, "xx"), "xxabc")
        })
    })
    describe("at the end", () => {
        it("should return the string after insertion", () => {
            assert.equal(diff.insert("abc", 3, "xx"), "abcxx")
        })
    })
    describe("at position < 0", () => {
        it("should throw RangeError", () => {
            assert.throws(() => {
                diff.insert("abc", -1, "xx")
            }, {
                name: "RangeError"
            })
        })
    })
    describe("at position > length", () => {
        it("should throw RangeError", () => {
            assert.throws(() => {
                diff.insert("abc", 5, "xx")
            }, {
                name: "RangeError"
            })
        })
    })
})

describe("delete string", () => {
    describe("in the middle", () => {
        it("should return the string after deletion", () => {
            assert.equal(diff.del("abcde", 1, "bc"), "ade")
        })
    })
    describe("from the beginning", () => {
        it("should return the string after deletion", () => {
            assert.equal(diff.del("abcde", 0, "abc"), "de")
        })
    })
    describe("in the end", () => {
        it("should return the string after deletion", () => {
            assert.equal(diff.del("abcde", 5, ""), "abcde")
        })
    })
    describe("at position < 0", () => {
        it("should throw RangeError", () => {
            assert.throws(() => {
                diff.del("abcde", -1, "aa")
            }, {
                name: "RangeError"
            })
        })
    })
    describe("at position > length", () => {
        it("should throw RangeError", () => {
            assert.throws(() => {
                diff.del("abcde", 6, "aa")
            }, {
                name: "RangeError"
            })
        })
    })
    describe("but the deletion doesn't match", () => {
        it("should throw Error", () => {
            assert.throws(() => {
                diff.del("abcde", 2, "de")
            }, {
                name: "Error"
            })
        })
    })
})

