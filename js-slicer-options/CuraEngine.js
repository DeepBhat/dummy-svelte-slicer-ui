var Module = typeof Module !== "undefined" ? Module : {};
var objAssign = Object.assign;
var moduleOverrides = objAssign({}, Module);
var arguments_ = [];
var thisProgram = "./this.program";
var quit_ = (status, toThrow) => {
    throw toThrow
};
var ENVIRONMENT_IS_WEB = typeof window === "object";
var ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
var ENVIRONMENT_IS_NODE = typeof process === "object" && typeof process.versions === "object" && typeof process.versions.node === "string";
var scriptDirectory = "";

function locateFile(path) {
    if (Module["locateFile"]) {
        return Module["locateFile"](path, scriptDirectory)
    }
    return scriptDirectory + path
}
var read_, readAsync, readBinary, setWindowTitle;

function logExceptionOnExit(e) {
    if (e instanceof ExitStatus) return;
    let toLog = e;
    err("exiting due to exception: " + toLog)
}
var fs;
var nodePath;
var requireNodeFS;
if (ENVIRONMENT_IS_NODE) {
    if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = require("path").dirname(scriptDirectory) + "/"
    } else {
        scriptDirectory = __dirname + "/"
    }
    requireNodeFS = (() => {
        if (!nodePath) {
            fs = require("fs");
            nodePath = require("path")
        }
    });
    read_ = function shell_read(filename, binary) {
        requireNodeFS();
        filename = nodePath["normalize"](filename);
        return fs.readFileSync(filename, binary ? null : "utf8")
    };
    readBinary = (filename => {
        var ret = read_(filename, true);
        if (!ret.buffer) {
            ret = new Uint8Array(ret)
        }
        return ret
    });
    readAsync = ((filename, onload, onerror) => {
        requireNodeFS();
        filename = nodePath["normalize"](filename);
        fs.readFile(filename, function (err, data) {
            if (err) onerror(err);
            else onload(data.buffer)
        })
    });
    if (process["argv"].length > 1) {
        thisProgram = process["argv"][1].replace(/\\/g, "/")
    }
    arguments_ = process["argv"].slice(2);
    if (typeof module !== "undefined") {
        module["exports"] = Module
    }
    process["on"]("uncaughtException", function (ex) {
        if (!(ex instanceof ExitStatus)) {
            throw ex
        }
    });
    process["on"]("unhandledRejection", function (reason) {
        throw reason
    });
    quit_ = ((status, toThrow) => {
        if (keepRuntimeAlive()) {
            process["exitCode"] = status;
            throw toThrow
        }
        logExceptionOnExit(toThrow);
        process["exit"](status)
    });
    Module["inspect"] = function () {
        return "[Emscripten Module object]"
    }
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href
    } else if (typeof document !== "undefined" && document.currentScript) {
        scriptDirectory = document.currentScript.src
    }
    if (scriptDirectory.indexOf("blob:") !== 0) {
        scriptDirectory = scriptDirectory.substr(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1)
    } else {
        scriptDirectory = ""
    } {
        read_ = (url => {
            var xhr = new XMLHttpRequest;
            xhr.open("GET", url, false);
            xhr.send(null);
            return xhr.responseText
        });
        if (ENVIRONMENT_IS_WORKER) {
            readBinary = (url => {
                var xhr = new XMLHttpRequest;
                xhr.open("GET", url, false);
                xhr.responseType = "arraybuffer";
                xhr.send(null);
                return new Uint8Array(xhr.response)
            })
        }
        readAsync = ((url, onload, onerror) => {
            var xhr = new XMLHttpRequest;
            xhr.open("GET", url, true);
            xhr.responseType = "arraybuffer";
            xhr.onload = (() => {
                if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                    onload(xhr.response);
                    return
                }
                onerror()
            });
            xhr.onerror = onerror;
            xhr.send(null)
        })
    }
    setWindowTitle = (title => document.title = title)
} else {}
var out = Module["print"] || console.log.bind(console);
var err = Module["printErr"] || console.warn.bind(console);
objAssign(Module, moduleOverrides);
moduleOverrides = null;
if (Module["arguments"]) arguments_ = Module["arguments"];
if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
if (Module["quit"]) quit_ = Module["quit"];
var wasmBinary;
if (Module["wasmBinary"]) wasmBinary = Module["wasmBinary"];
var noExitRuntime = Module["noExitRuntime"] || true;
if (typeof WebAssembly !== "object") {
    abort("no native wasm support detected")
}
var wasmMemory;
var ABORT = false;
var EXITSTATUS;

function assert(condition, text) {
    if (!condition) {
        abort(text)
    }
}
var UTF8Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : undefined;

function UTF8ArrayToString(heap, idx, maxBytesToRead) {
    var endIdx = idx + maxBytesToRead;
    var endPtr = idx;
    while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;
    if (endPtr - idx > 16 && heap.subarray && UTF8Decoder) {
        return UTF8Decoder.decode(heap.subarray(idx, endPtr))
    } else {
        var str = "";
        while (idx < endPtr) {
            var u0 = heap[idx++];
            if (!(u0 & 128)) {
                str += String.fromCharCode(u0);
                continue
            }
            var u1 = heap[idx++] & 63;
            if ((u0 & 224) == 192) {
                str += String.fromCharCode((u0 & 31) << 6 | u1);
                continue
            }
            var u2 = heap[idx++] & 63;
            if ((u0 & 240) == 224) {
                u0 = (u0 & 15) << 12 | u1 << 6 | u2
            } else {
                u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heap[idx++] & 63
            }
            if (u0 < 65536) {
                str += String.fromCharCode(u0)
            } else {
                var ch = u0 - 65536;
                str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023)
            }
        }
    }
    return str
}

function UTF8ToString(ptr, maxBytesToRead) {
    return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : ""
}

function stringToUTF8Array(str, heap, outIdx, maxBytesToWrite) {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) {
            var u1 = str.charCodeAt(++i);
            u = 65536 + ((u & 1023) << 10) | u1 & 1023
        }
        if (u <= 127) {
            if (outIdx >= endIdx) break;
            heap[outIdx++] = u
        } else if (u <= 2047) {
            if (outIdx + 1 >= endIdx) break;
            heap[outIdx++] = 192 | u >> 6;
            heap[outIdx++] = 128 | u & 63
        } else if (u <= 65535) {
            if (outIdx + 2 >= endIdx) break;
            heap[outIdx++] = 224 | u >> 12;
            heap[outIdx++] = 128 | u >> 6 & 63;
            heap[outIdx++] = 128 | u & 63
        } else {
            if (outIdx + 3 >= endIdx) break;
            heap[outIdx++] = 240 | u >> 18;
            heap[outIdx++] = 128 | u >> 12 & 63;
            heap[outIdx++] = 128 | u >> 6 & 63;
            heap[outIdx++] = 128 | u & 63
        }
    }
    heap[outIdx] = 0;
    return outIdx - startIdx
}

function stringToUTF8(str, outPtr, maxBytesToWrite) {
    return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite)
}

function lengthBytesUTF8(str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
        if (u <= 127) ++len;
        else if (u <= 2047) len += 2;
        else if (u <= 65535) len += 3;
        else len += 4
    }
    return len
}

function allocateUTF8OnStack(str) {
    var size = lengthBytesUTF8(str) + 1;
    var ret = stackAlloc(size);
    stringToUTF8Array(str, HEAP8, ret, size);
    return ret
}

function writeArrayToMemory(array, buffer) {
    HEAP8.set(array, buffer)
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
    for (var i = 0; i < str.length; ++i) {
        HEAP8[buffer++ >> 0] = str.charCodeAt(i)
    }
    if (!dontAddNull) HEAP8[buffer >> 0] = 0
}
var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBufferAndViews(buf) {
    buffer = buf;
    Module["HEAP8"] = HEAP8 = new Int8Array(buf);
    Module["HEAP16"] = HEAP16 = new Int16Array(buf);
    Module["HEAP32"] = HEAP32 = new Int32Array(buf);
    Module["HEAPU8"] = HEAPU8 = new Uint8Array(buf);
    Module["HEAPU16"] = HEAPU16 = new Uint16Array(buf);
    Module["HEAPU32"] = HEAPU32 = new Uint32Array(buf);
    Module["HEAPF32"] = HEAPF32 = new Float32Array(buf);
    Module["HEAPF64"] = HEAPF64 = new Float64Array(buf)
}
var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 16777216;
var wasmTable;
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATMAIN__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
var runtimeExited = false;
var runtimeKeepaliveCounter = 0;

function keepRuntimeAlive() {
    return noExitRuntime || runtimeKeepaliveCounter > 0
}

function preRun() {
    if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
            addOnPreRun(Module["preRun"].shift())
        }
    }
    callRuntimeCallbacks(__ATPRERUN__)
}

function initRuntime() {
    runtimeInitialized = true;
    if (!Module["noFSInit"] && !FS.init.initialized) FS.init();
    FS.ignorePermissions = false;
    TTY.init();
    callRuntimeCallbacks(__ATINIT__)
}

function preMain() {
    callRuntimeCallbacks(__ATMAIN__)
}

function exitRuntime() {
    runtimeExited = true
}

function postRun() {
    if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
            addOnPostRun(Module["postRun"].shift())
        }
    }
    callRuntimeCallbacks(__ATPOSTRUN__)
}

function addOnPreRun(cb) {
    __ATPRERUN__.unshift(cb)
}

function addOnInit(cb) {
    __ATINIT__.unshift(cb)
}

function addOnPostRun(cb) {
    __ATPOSTRUN__.unshift(cb)
}
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;

function getUniqueRunDependency(id) {
    return id
}

function addRunDependency(id) {
    runDependencies++;
    if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies)
    }
}

function removeRunDependency(id) {
    runDependencies--;
    if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies)
    }
    if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
            clearInterval(runDependencyWatcher);
            runDependencyWatcher = null
        }
        if (dependenciesFulfilled) {
            var callback = dependenciesFulfilled;
            dependenciesFulfilled = null;
            callback()
        }
    }
}
Module["preloadedImages"] = {};
Module["preloadedAudios"] = {};

function abort(what) {
    {
        if (Module["onAbort"]) {
            Module["onAbort"](what)
        }
    }
    what = "Aborted(" + what + ")";
    err(what);
    ABORT = true;
    EXITSTATUS = 1;
    what += ". Build with -s ASSERTIONS=1 for more info.";
    var e = new WebAssembly.RuntimeError(what);
    throw e
}
var dataURIPrefix = "data:application/octet-stream;base64,";

function isDataURI(filename) {
    return filename.startsWith(dataURIPrefix)
}

function isFileURI(filename) {
    return filename.startsWith("file://")
}
var wasmBinaryFile;
wasmBinaryFile = "CuraEngine.wasm";
if (!isDataURI(wasmBinaryFile)) {
    wasmBinaryFile = locateFile(wasmBinaryFile)
}

function getBinary(file) {
    try {
        if (file == wasmBinaryFile && wasmBinary) {
            return new Uint8Array(wasmBinary)
        }
        if (readBinary) {
            return readBinary(file)
        } else {
            throw "both async and sync fetching of the wasm failed"
        }
    } catch (err) {
        abort(err)
    }
}

function getBinaryPromise() {
    if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
        if (typeof fetch === "function" && !isFileURI(wasmBinaryFile)) {
            return fetch(wasmBinaryFile, {
                credentials: "same-origin"
            }).then(function (response) {
                if (!response["ok"]) {
                    throw "failed to load wasm binary file at '" + wasmBinaryFile + "'"
                }
                return response["arrayBuffer"]()
            }).catch(function () {
                return getBinary(wasmBinaryFile)
            })
        } else {
            if (readAsync) {
                return new Promise(function (resolve, reject) {
                    readAsync(wasmBinaryFile, function (response) {
                        resolve(new Uint8Array(response))
                    }, reject)
                })
            }
        }
    }
    return Promise.resolve().then(function () {
        return getBinary(wasmBinaryFile)
    })
}

function createWasm() {
    var info = {
        "a": asmLibraryArg
    };

    function receiveInstance(instance, module) {
        var exports = instance.exports;
        Module["asm"] = exports;
        wasmMemory = Module["asm"]["r"];
        updateGlobalBufferAndViews(wasmMemory.buffer);
        wasmTable = Module["asm"]["x"];
        addOnInit(Module["asm"]["s"]);
        removeRunDependency("wasm-instantiate")
    }
    addRunDependency("wasm-instantiate");

    function receiveInstantiationResult(result) {
        receiveInstance(result["instance"])
    }

    function instantiateArrayBuffer(receiver) {
        return getBinaryPromise().then(function (binary) {
            return WebAssembly.instantiate(binary, info)
        }).then(function (instance) {
            return instance
        }).then(receiver, function (reason) {
            err("failed to asynchronously prepare wasm: " + reason);
            abort(reason)
        })
    }

    function instantiateAsync() {
        if (!wasmBinary && typeof WebAssembly.instantiateStreaming === "function" && !isDataURI(wasmBinaryFile) && !isFileURI(wasmBinaryFile) && typeof fetch === "function") {
            return fetch(wasmBinaryFile, {
                credentials: "same-origin"
            }).then(function (response) {
                var result = WebAssembly.instantiateStreaming(response, info);
                return result.then(receiveInstantiationResult, function (reason) {
                    err("wasm streaming compile failed: " + reason);
                    err("falling back to ArrayBuffer instantiation");
                    return instantiateArrayBuffer(receiveInstantiationResult)
                })
            })
        } else {
            return instantiateArrayBuffer(receiveInstantiationResult)
        }
    }
    if (Module["instantiateWasm"]) {
        try {
            var exports = Module["instantiateWasm"](info, receiveInstance);
            return exports
        } catch (e) {
            err("Module.instantiateWasm callback failed with error: " + e);
            return false
        }
    }
    instantiateAsync();
    return {}
}
var tempDouble;
var tempI64;

function callRuntimeCallbacks(callbacks) {
    while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == "function") {
            callback(Module);
            continue
        }
        var func = callback.func;
        if (typeof func === "number") {
            if (callback.arg === undefined) {
                getWasmTableEntry(func)()
            } else {
                getWasmTableEntry(func)(callback.arg)
            }
        } else {
            func(callback.arg === undefined ? null : callback.arg)
        }
    }
}
var wasmTableMirror = [];

function getWasmTableEntry(funcPtr) {
    var func = wasmTableMirror[funcPtr];
    if (!func) {
        if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
        wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr)
    }
    return func
}

function handleException(e) {
    if (e instanceof ExitStatus || e == "unwind") {
        return EXITSTATUS
    }
    quit_(1, e)
}

function ___cxa_allocate_exception(size) {
    return _malloc(size + 16) + 16
}

function ExceptionInfo(excPtr) {
    this.excPtr = excPtr;
    this.ptr = excPtr - 16;
    this.set_type = function (type) {
        HEAP32[this.ptr + 4 >> 2] = type
    };
    this.get_type = function () {
        return HEAP32[this.ptr + 4 >> 2]
    };
    this.set_destructor = function (destructor) {
        HEAP32[this.ptr + 8 >> 2] = destructor
    };
    this.get_destructor = function () {
        return HEAP32[this.ptr + 8 >> 2]
    };
    this.set_refcount = function (refcount) {
        HEAP32[this.ptr >> 2] = refcount
    };
    this.set_caught = function (caught) {
        caught = caught ? 1 : 0;
        HEAP8[this.ptr + 12 >> 0] = caught
    };
    this.get_caught = function () {
        return HEAP8[this.ptr + 12 >> 0] != 0
    };
    this.set_rethrown = function (rethrown) {
        rethrown = rethrown ? 1 : 0;
        HEAP8[this.ptr + 13 >> 0] = rethrown
    };
    this.get_rethrown = function () {
        return HEAP8[this.ptr + 13 >> 0] != 0
    };
    this.init = function (type, destructor) {
        this.set_type(type);
        this.set_destructor(destructor);
        this.set_refcount(0);
        this.set_caught(false);
        this.set_rethrown(false)
    };
    this.add_ref = function () {
        var value = HEAP32[this.ptr >> 2];
        HEAP32[this.ptr >> 2] = value + 1
    };
    this.release_ref = function () {
        var prev = HEAP32[this.ptr >> 2];
        HEAP32[this.ptr >> 2] = prev - 1;
        return prev === 1
    }
}
var exceptionLast = 0;
var uncaughtExceptionCount = 0;

function ___cxa_throw(ptr, type, destructor) {
    var info = new ExceptionInfo(ptr);
    info.init(type, destructor);
    exceptionLast = ptr;
    uncaughtExceptionCount++;
    throw ptr
}

function setErrNo(value) {
    HEAP32[___errno_location() >> 2] = value;
    return value
}
var PATH = {
    splitPath: function (filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1)
    },
    normalizeArray: function (parts, allowAboveRoot) {
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
            var last = parts[i];
            if (last === ".") {
                parts.splice(i, 1)
            } else if (last === "..") {
                parts.splice(i, 1);
                up++
            } else if (up) {
                parts.splice(i, 1);
                up--
            }
        }
        if (allowAboveRoot) {
            for (; up; up--) {
                parts.unshift("..")
            }
        }
        return parts
    },
    normalize: function (path) {
        var isAbsolute = path.charAt(0) === "/",
            trailingSlash = path.substr(-1) === "/";
        path = PATH.normalizeArray(path.split("/").filter(function (p) {
            return !!p
        }), !isAbsolute).join("/");
        if (!path && !isAbsolute) {
            path = "."
        }
        if (path && trailingSlash) {
            path += "/"
        }
        return (isAbsolute ? "/" : "") + path
    },
    dirname: function (path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
            return "."
        }
        if (dir) {
            dir = dir.substr(0, dir.length - 1)
        }
        return root + dir
    },
    basename: function (path) {
        if (path === "/") return "/";
        path = PATH.normalize(path);
        path = path.replace(/\/$/, "");
        var lastSlash = path.lastIndexOf("/");
        if (lastSlash === -1) return path;
        return path.substr(lastSlash + 1)
    },
    extname: function (path) {
        return PATH.splitPath(path)[3]
    },
    join: function () {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join("/"))
    },
    join2: function (l, r) {
        return PATH.normalize(l + "/" + r)
    }
};

function getRandomDevice() {
    if (typeof crypto === "object" && typeof crypto["getRandomValues"] === "function") {
        var randomBuffer = new Uint8Array(1);
        return function () {
            crypto.getRandomValues(randomBuffer);
            return randomBuffer[0]
        }
    } else if (ENVIRONMENT_IS_NODE) {
        try {
            var crypto_module = require("crypto");
            return function () {
                return crypto_module["randomBytes"](1)[0]
            }
        } catch (e) {}
    }
    return function () {
        abort("randomDevice")
    }
}
var PATH_FS = {
    resolve: function () {
        var resolvedPath = "",
            resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
            var path = i >= 0 ? arguments[i] : FS.cwd();
            if (typeof path !== "string") {
                throw new TypeError("Arguments to path.resolve must be strings")
            } else if (!path) {
                return ""
            }
            resolvedPath = path + "/" + resolvedPath;
            resolvedAbsolute = path.charAt(0) === "/"
        }
        resolvedPath = PATH.normalizeArray(resolvedPath.split("/").filter(function (p) {
            return !!p
        }), !resolvedAbsolute).join("/");
        return (resolvedAbsolute ? "/" : "") + resolvedPath || "."
    },
    relative: function (from, to) {
        from = PATH_FS.resolve(from).substr(1);
        to = PATH_FS.resolve(to).substr(1);

        function trim(arr) {
            var start = 0;
            for (; start < arr.length; start++) {
                if (arr[start] !== "") break
            }
            var end = arr.length - 1;
            for (; end >= 0; end--) {
                if (arr[end] !== "") break
            }
            if (start > end) return [];
            return arr.slice(start, end - start + 1)
        }
        var fromParts = trim(from.split("/"));
        var toParts = trim(to.split("/"));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
            if (fromParts[i] !== toParts[i]) {
                samePartsLength = i;
                break
            }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
            outputParts.push("..")
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join("/")
    }
};
var TTY = {
    ttys: [],
    init: function () {},
    shutdown: function () {},
    register: function (dev, ops) {
        TTY.ttys[dev] = {
            input: [],
            output: [],
            ops: ops
        };
        FS.registerDevice(dev, TTY.stream_ops)
    },
    stream_ops: {
        open: function (stream) {
            var tty = TTY.ttys[stream.node.rdev];
            if (!tty) {
                throw new FS.ErrnoError(43)
            }
            stream.tty = tty;
            stream.seekable = false
        },
        close: function (stream) {
            stream.tty.ops.flush(stream.tty)
        },
        flush: function (stream) {
            stream.tty.ops.flush(stream.tty)
        },
        read: function (stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.get_char) {
                throw new FS.ErrnoError(60)
            }
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
                var result;
                try {
                    result = stream.tty.ops.get_char(stream.tty)
                } catch (e) {
                    throw new FS.ErrnoError(29)
                }
                if (result === undefined && bytesRead === 0) {
                    throw new FS.ErrnoError(6)
                }
                if (result === null || result === undefined) break;
                bytesRead++;
                buffer[offset + i] = result
            }
            if (bytesRead) {
                stream.node.timestamp = Date.now()
            }
            return bytesRead
        },
        write: function (stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.put_char) {
                throw new FS.ErrnoError(60)
            }
            try {
                for (var i = 0; i < length; i++) {
                    stream.tty.ops.put_char(stream.tty, buffer[offset + i])
                }
            } catch (e) {
                throw new FS.ErrnoError(29)
            }
            if (length) {
                stream.node.timestamp = Date.now()
            }
            return i
        }
    },
    default_tty_ops: {
        get_char: function (tty) {
            if (!tty.input.length) {
                var result = null;
                if (ENVIRONMENT_IS_NODE) {
                    var BUFSIZE = 256;
                    var buf = Buffer.alloc(BUFSIZE);
                    var bytesRead = 0;
                    try {
                        bytesRead = fs.readSync(process.stdin.fd, buf, 0, BUFSIZE, null)
                    } catch (e) {
                        if (e.toString().includes("EOF")) bytesRead = 0;
                        else throw e
                    }
                    if (bytesRead > 0) {
                        result = buf.slice(0, bytesRead).toString("utf-8")
                    } else {
                        result = null
                    }
                } else if (typeof window != "undefined" && typeof window.prompt == "function") {
                    result = window.prompt("Input: ");
                    if (result !== null) {
                        result += "\n"
                    }
                } else if (typeof readline == "function") {
                    result = readline();
                    if (result !== null) {
                        result += "\n"
                    }
                }
                if (!result) {
                    return null
                }
                tty.input = intArrayFromString(result, true)
            }
            return tty.input.shift()
        },
        put_char: function (tty, val) {
            if (val === null || val === 10) {
                out(UTF8ArrayToString(tty.output, 0));
                tty.output = []
            } else {
                if (val != 0) tty.output.push(val)
            }
        },
        flush: function (tty) {
            if (tty.output && tty.output.length > 0) {
                out(UTF8ArrayToString(tty.output, 0));
                tty.output = []
            }
        }
    },
    default_tty1_ops: {
        put_char: function (tty, val) {
            if (val === null || val === 10) {
                err(UTF8ArrayToString(tty.output, 0));
                tty.output = []
            } else {
                if (val != 0) tty.output.push(val)
            }
        },
        flush: function (tty) {
            if (tty.output && tty.output.length > 0) {
                err(UTF8ArrayToString(tty.output, 0));
                tty.output = []
            }
        }
    }
};

function mmapAlloc(size) {
    abort()
}
var MEMFS = {
    ops_table: null,
    mount: function (mount) {
        return MEMFS.createNode(null, "/", 16384 | 511, 0)
    },
    createNode: function (parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
            throw new FS.ErrnoError(63)
        }
        if (!MEMFS.ops_table) {
            MEMFS.ops_table = {
                dir: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr,
                        lookup: MEMFS.node_ops.lookup,
                        mknod: MEMFS.node_ops.mknod,
                        rename: MEMFS.node_ops.rename,
                        unlink: MEMFS.node_ops.unlink,
                        rmdir: MEMFS.node_ops.rmdir,
                        readdir: MEMFS.node_ops.readdir,
                        symlink: MEMFS.node_ops.symlink
                    },
                    stream: {
                        llseek: MEMFS.stream_ops.llseek
                    }
                },
                file: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr
                    },
                    stream: {
                        llseek: MEMFS.stream_ops.llseek,
                        read: MEMFS.stream_ops.read,
                        write: MEMFS.stream_ops.write,
                        allocate: MEMFS.stream_ops.allocate,
                        mmap: MEMFS.stream_ops.mmap,
                        msync: MEMFS.stream_ops.msync
                    }
                },
                link: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr,
                        readlink: MEMFS.node_ops.readlink
                    },
                    stream: {}
                },
                chrdev: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr
                    },
                    stream: FS.chrdev_stream_ops
                }
            }
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
            node.node_ops = MEMFS.ops_table.dir.node;
            node.stream_ops = MEMFS.ops_table.dir.stream;
            node.contents = {}
        } else if (FS.isFile(node.mode)) {
            node.node_ops = MEMFS.ops_table.file.node;
            node.stream_ops = MEMFS.ops_table.file.stream;
            node.usedBytes = 0;
            node.contents = null
        } else if (FS.isLink(node.mode)) {
            node.node_ops = MEMFS.ops_table.link.node;
            node.stream_ops = MEMFS.ops_table.link.stream
        } else if (FS.isChrdev(node.mode)) {
            node.node_ops = MEMFS.ops_table.chrdev.node;
            node.stream_ops = MEMFS.ops_table.chrdev.stream
        }
        node.timestamp = Date.now();
        if (parent) {
            parent.contents[name] = node;
            parent.timestamp = node.timestamp
        }
        return node
    },
    getFileDataAsTypedArray: function (node) {
        if (!node.contents) return new Uint8Array(0);
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
        return new Uint8Array(node.contents)
    },
    expandFileStorage: function (node, newCapacity) {
        var prevCapacity = node.contents ? node.contents.length : 0;
        if (prevCapacity >= newCapacity) return;
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) >>> 0);
        if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
        var oldContents = node.contents;
        node.contents = new Uint8Array(newCapacity);
        if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0)
    },
    resizeFileStorage: function (node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
            node.contents = null;
            node.usedBytes = 0
        } else {
            var oldContents = node.contents;
            node.contents = new Uint8Array(newSize);
            if (oldContents) {
                node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)))
            }
            node.usedBytes = newSize
        }
    },
    node_ops: {
        getattr: function (node) {
            var attr = {};
            attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
            attr.ino = node.id;
            attr.mode = node.mode;
            attr.nlink = 1;
            attr.uid = 0;
            attr.gid = 0;
            attr.rdev = node.rdev;
            if (FS.isDir(node.mode)) {
                attr.size = 4096
            } else if (FS.isFile(node.mode)) {
                attr.size = node.usedBytes
            } else if (FS.isLink(node.mode)) {
                attr.size = node.link.length
            } else {
                attr.size = 0
            }
            attr.atime = new Date(node.timestamp);
            attr.mtime = new Date(node.timestamp);
            attr.ctime = new Date(node.timestamp);
            attr.blksize = 4096;
            attr.blocks = Math.ceil(attr.size / attr.blksize);
            return attr
        },
        setattr: function (node, attr) {
            if (attr.mode !== undefined) {
                node.mode = attr.mode
            }
            if (attr.timestamp !== undefined) {
                node.timestamp = attr.timestamp
            }
            if (attr.size !== undefined) {
                MEMFS.resizeFileStorage(node, attr.size)
            }
        },
        lookup: function (parent, name) {
            throw FS.genericErrors[44]
        },
        mknod: function (parent, name, mode, dev) {
            return MEMFS.createNode(parent, name, mode, dev)
        },
        rename: function (old_node, new_dir, new_name) {
            if (FS.isDir(old_node.mode)) {
                var new_node;
                try {
                    new_node = FS.lookupNode(new_dir, new_name)
                } catch (e) {}
                if (new_node) {
                    for (var i in new_node.contents) {
                        throw new FS.ErrnoError(55)
                    }
                }
            }
            delete old_node.parent.contents[old_node.name];
            old_node.parent.timestamp = Date.now();
            old_node.name = new_name;
            new_dir.contents[new_name] = old_node;
            new_dir.timestamp = old_node.parent.timestamp;
            old_node.parent = new_dir
        },
        unlink: function (parent, name) {
            delete parent.contents[name];
            parent.timestamp = Date.now()
        },
        rmdir: function (parent, name) {
            var node = FS.lookupNode(parent, name);
            for (var i in node.contents) {
                throw new FS.ErrnoError(55)
            }
            delete parent.contents[name];
            parent.timestamp = Date.now()
        },
        readdir: function (node) {
            var entries = [".", ".."];
            for (var key in node.contents) {
                if (!node.contents.hasOwnProperty(key)) {
                    continue
                }
                entries.push(key)
            }
            return entries
        },
        symlink: function (parent, newname, oldpath) {
            var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
            node.link = oldpath;
            return node
        },
        readlink: function (node) {
            if (!FS.isLink(node.mode)) {
                throw new FS.ErrnoError(28)
            }
            return node.link
        }
    },
    stream_ops: {
        read: function (stream, buffer, offset, length, position) {
            var contents = stream.node.contents;
            if (position >= stream.node.usedBytes) return 0;
            var size = Math.min(stream.node.usedBytes - position, length);
            if (size > 8 && contents.subarray) {
                buffer.set(contents.subarray(position, position + size), offset)
            } else {
                for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i]
            }
            return size
        },
        write: function (stream, buffer, offset, length, position, canOwn) {
            if (!length) return 0;
            var node = stream.node;
            node.timestamp = Date.now();
            if (buffer.subarray && (!node.contents || node.contents.subarray)) {
                if (canOwn) {
                    node.contents = buffer.subarray(offset, offset + length);
                    node.usedBytes = length;
                    return length
                } else if (node.usedBytes === 0 && position === 0) {
                    node.contents = buffer.slice(offset, offset + length);
                    node.usedBytes = length;
                    return length
                } else if (position + length <= node.usedBytes) {
                    node.contents.set(buffer.subarray(offset, offset + length), position);
                    return length
                }
            }
            MEMFS.expandFileStorage(node, position + length);
            if (node.contents.subarray && buffer.subarray) {
                node.contents.set(buffer.subarray(offset, offset + length), position)
            } else {
                for (var i = 0; i < length; i++) {
                    node.contents[position + i] = buffer[offset + i]
                }
            }
            node.usedBytes = Math.max(node.usedBytes, position + length);
            return length
        },
        llseek: function (stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    position += stream.node.usedBytes
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(28)
            }
            return position
        },
        allocate: function (stream, offset, length) {
            MEMFS.expandFileStorage(stream.node, offset + length);
            stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length)
        },
        mmap: function (stream, address, length, position, prot, flags) {
            if (address !== 0) {
                throw new FS.ErrnoError(28)
            }
            if (!FS.isFile(stream.node.mode)) {
                throw new FS.ErrnoError(43)
            }
            var ptr;
            var allocated;
            var contents = stream.node.contents;
            if (!(flags & 2) && contents.buffer === buffer) {
                allocated = false;
                ptr = contents.byteOffset
            } else {
                if (position > 0 || position + length < contents.length) {
                    if (contents.subarray) {
                        contents = contents.subarray(position, position + length)
                    } else {
                        contents = Array.prototype.slice.call(contents, position, position + length)
                    }
                }
                allocated = true;
                ptr = mmapAlloc(length);
                if (!ptr) {
                    throw new FS.ErrnoError(48)
                }
                HEAP8.set(contents, ptr)
            }
            return {
                ptr: ptr,
                allocated: allocated
            }
        },
        msync: function (stream, buffer, offset, length, mmapFlags) {
            if (!FS.isFile(stream.node.mode)) {
                throw new FS.ErrnoError(43)
            }
            if (mmapFlags & 2) {
                return 0
            }
            var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
            return 0
        }
    }
};

function asyncLoad(url, onload, onerror, noRunDep) {
    var dep = !noRunDep ? getUniqueRunDependency("al " + url) : "";
    readAsync(url, function (arrayBuffer) {
        assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
        onload(new Uint8Array(arrayBuffer));
        if (dep) removeRunDependency(dep)
    }, function (event) {
        if (onerror) {
            onerror()
        } else {
            throw 'Loading data file "' + url + '" failed.'
        }
    });
    if (dep) addRunDependency(dep)
}
var FS = {
    root: null,
    mounts: [],
    devices: {},
    streams: [],
    nextInode: 1,
    nameTable: null,
    currentPath: "/",
    initialized: false,
    ignorePermissions: true,
    ErrnoError: null,
    genericErrors: {},
    filesystems: null,
    syncFSRequests: 0,
    lookupPath: function (path, opts = {}) {
        path = PATH_FS.resolve(FS.cwd(), path);
        if (!path) return {
            path: "",
            node: null
        };
        var defaults = {
            follow_mount: true,
            recurse_count: 0
        };
        for (var key in defaults) {
            if (opts[key] === undefined) {
                opts[key] = defaults[key]
            }
        }
        if (opts.recurse_count > 8) {
            throw new FS.ErrnoError(32)
        }
        var parts = PATH.normalizeArray(path.split("/").filter(function (p) {
            return !!p
        }), false);
        var current = FS.root;
        var current_path = "/";
        for (var i = 0; i < parts.length; i++) {
            var islast = i === parts.length - 1;
            if (islast && opts.parent) {
                break
            }
            current = FS.lookupNode(current, parts[i]);
            current_path = PATH.join2(current_path, parts[i]);
            if (FS.isMountpoint(current)) {
                if (!islast || islast && opts.follow_mount) {
                    current = current.mounted.root
                }
            }
            if (!islast || opts.follow) {
                var count = 0;
                while (FS.isLink(current.mode)) {
                    var link = FS.readlink(current_path);
                    current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
                    var lookup = FS.lookupPath(current_path, {
                        recurse_count: opts.recurse_count
                    });
                    current = lookup.node;
                    if (count++ > 40) {
                        throw new FS.ErrnoError(32)
                    }
                }
            }
        }
        return {
            path: current_path,
            node: current
        }
    },
    getPath: function (node) {
        var path;
        while (true) {
            if (FS.isRoot(node)) {
                var mount = node.mount.mountpoint;
                if (!path) return mount;
                return mount[mount.length - 1] !== "/" ? mount + "/" + path : mount + path
            }
            path = path ? node.name + "/" + path : node.name;
            node = node.parent
        }
    },
    hashName: function (parentid, name) {
        var hash = 0;
        for (var i = 0; i < name.length; i++) {
            hash = (hash << 5) - hash + name.charCodeAt(i) | 0
        }
        return (parentid + hash >>> 0) % FS.nameTable.length
    },
    hashAddNode: function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node
    },
    hashRemoveNode: function (node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
            FS.nameTable[hash] = node.name_next
        } else {
            var current = FS.nameTable[hash];
            while (current) {
                if (current.name_next === node) {
                    current.name_next = node.name_next;
                    break
                }
                current = current.name_next
            }
        }
    },
    lookupNode: function (parent, name) {
        var errCode = FS.mayLookup(parent);
        if (errCode) {
            throw new FS.ErrnoError(errCode, parent)
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
            var nodeName = node.name;
            if (node.parent.id === parent.id && nodeName === name) {
                return node
            }
        }
        return FS.lookup(parent, name)
    },
    createNode: function (parent, name, mode, rdev) {
        var node = new FS.FSNode(parent, name, mode, rdev);
        FS.hashAddNode(node);
        return node
    },
    destroyNode: function (node) {
        FS.hashRemoveNode(node)
    },
    isRoot: function (node) {
        return node === node.parent
    },
    isMountpoint: function (node) {
        return !!node.mounted
    },
    isFile: function (mode) {
        return (mode & 61440) === 32768
    },
    isDir: function (mode) {
        return (mode & 61440) === 16384
    },
    isLink: function (mode) {
        return (mode & 61440) === 40960
    },
    isChrdev: function (mode) {
        return (mode & 61440) === 8192
    },
    isBlkdev: function (mode) {
        return (mode & 61440) === 24576
    },
    isFIFO: function (mode) {
        return (mode & 61440) === 4096
    },
    isSocket: function (mode) {
        return (mode & 49152) === 49152
    },
    flagModes: {
        "r": 0,
        "r+": 2,
        "w": 577,
        "w+": 578,
        "a": 1089,
        "a+": 1090
    },
    modeStringToFlags: function (str) {
        var flags = FS.flagModes[str];
        if (typeof flags === "undefined") {
            throw new Error("Unknown file open mode: " + str)
        }
        return flags
    },
    flagsToPermissionString: function (flag) {
        var perms = ["r", "w", "rw"][flag & 3];
        if (flag & 512) {
            perms += "w"
        }
        return perms
    },
    nodePermissions: function (node, perms) {
        if (FS.ignorePermissions) {
            return 0
        }
        if (perms.includes("r") && !(node.mode & 292)) {
            return 2
        } else if (perms.includes("w") && !(node.mode & 146)) {
            return 2
        } else if (perms.includes("x") && !(node.mode & 73)) {
            return 2
        }
        return 0
    },
    mayLookup: function (dir) {
        var errCode = FS.nodePermissions(dir, "x");
        if (errCode) return errCode;
        if (!dir.node_ops.lookup) return 2;
        return 0
    },
    mayCreate: function (dir, name) {
        try {
            var node = FS.lookupNode(dir, name);
            return 20
        } catch (e) {}
        return FS.nodePermissions(dir, "wx")
    },
    mayDelete: function (dir, name, isdir) {
        var node;
        try {
            node = FS.lookupNode(dir, name)
        } catch (e) {
            return e.errno
        }
        var errCode = FS.nodePermissions(dir, "wx");
        if (errCode) {
            return errCode
        }
        if (isdir) {
            if (!FS.isDir(node.mode)) {
                return 54
            }
            if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
                return 10
            }
        } else {
            if (FS.isDir(node.mode)) {
                return 31
            }
        }
        return 0
    },
    mayOpen: function (node, flags) {
        if (!node) {
            return 44
        }
        if (FS.isLink(node.mode)) {
            return 32
        } else if (FS.isDir(node.mode)) {
            if (FS.flagsToPermissionString(flags) !== "r" || flags & 512) {
                return 31
            }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags))
    },
    MAX_OPEN_FDS: 4096,
    nextfd: function (fd_start = 0, fd_end = FS.MAX_OPEN_FDS) {
        for (var fd = fd_start; fd <= fd_end; fd++) {
            if (!FS.streams[fd]) {
                return fd
            }
        }
        throw new FS.ErrnoError(33)
    },
    getStream: function (fd) {
        return FS.streams[fd]
    },
    createStream: function (stream, fd_start, fd_end) {
        if (!FS.FSStream) {
            FS.FSStream = function () {};
            FS.FSStream.prototype = {
                object: {
                    get: function () {
                        return this.node
                    },
                    set: function (val) {
                        this.node = val
                    }
                },
                isRead: {
                    get: function () {
                        return (this.flags & 2097155) !== 1
                    }
                },
                isWrite: {
                    get: function () {
                        return (this.flags & 2097155) !== 0
                    }
                },
                isAppend: {
                    get: function () {
                        return this.flags & 1024
                    }
                }
            }
        }
        var newStream = new FS.FSStream;
        for (var p in stream) {
            newStream[p] = stream[p]
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream
    },
    closeStream: function (fd) {
        FS.streams[fd] = null
    },
    chrdev_stream_ops: {
        open: function (stream) {
            var device = FS.getDevice(stream.node.rdev);
            stream.stream_ops = device.stream_ops;
            if (stream.stream_ops.open) {
                stream.stream_ops.open(stream)
            }
        },
        llseek: function () {
            throw new FS.ErrnoError(70)
        }
    },
    major: function (dev) {
        return dev >> 8
    },
    minor: function (dev) {
        return dev & 255
    },
    makedev: function (ma, mi) {
        return ma << 8 | mi
    },
    registerDevice: function (dev, ops) {
        FS.devices[dev] = {
            stream_ops: ops
        }
    },
    getDevice: function (dev) {
        return FS.devices[dev]
    },
    getMounts: function (mount) {
        var mounts = [];
        var check = [mount];
        while (check.length) {
            var m = check.pop();
            mounts.push(m);
            check.push.apply(check, m.mounts)
        }
        return mounts
    },
    syncfs: function (populate, callback) {
        if (typeof populate === "function") {
            callback = populate;
            populate = false
        }
        FS.syncFSRequests++;
        if (FS.syncFSRequests > 1) {
            err("warning: " + FS.syncFSRequests + " FS.syncfs operations in flight at once, probably just doing extra work")
        }
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;

        function doCallback(errCode) {
            FS.syncFSRequests--;
            return callback(errCode)
        }

        function done(errCode) {
            if (errCode) {
                if (!done.errored) {
                    done.errored = true;
                    return doCallback(errCode)
                }
                return
            }
            if (++completed >= mounts.length) {
                doCallback(null)
            }
        }
        mounts.forEach(function (mount) {
            if (!mount.type.syncfs) {
                return done(null)
            }
            mount.type.syncfs(mount, populate, done)
        })
    },
    mount: function (type, opts, mountpoint) {
        var root = mountpoint === "/";
        var pseudo = !mountpoint;
        var node;
        if (root && FS.root) {
            throw new FS.ErrnoError(10)
        } else if (!root && !pseudo) {
            var lookup = FS.lookupPath(mountpoint, {
                follow_mount: false
            });
            mountpoint = lookup.path;
            node = lookup.node;
            if (FS.isMountpoint(node)) {
                throw new FS.ErrnoError(10)
            }
            if (!FS.isDir(node.mode)) {
                throw new FS.ErrnoError(54)
            }
        }
        var mount = {
            type: type,
            opts: opts,
            mountpoint: mountpoint,
            mounts: []
        };
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
        if (root) {
            FS.root = mountRoot
        } else if (node) {
            node.mounted = mount;
            if (node.mount) {
                node.mount.mounts.push(mount)
            }
        }
        return mountRoot
    },
    unmount: function (mountpoint) {
        var lookup = FS.lookupPath(mountpoint, {
            follow_mount: false
        });
        if (!FS.isMountpoint(lookup.node)) {
            throw new FS.ErrnoError(28)
        }
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
        Object.keys(FS.nameTable).forEach(function (hash) {
            var current = FS.nameTable[hash];
            while (current) {
                var next = current.name_next;
                if (mounts.includes(current.mount)) {
                    FS.destroyNode(current)
                }
                current = next
            }
        });
        node.mounted = null;
        var idx = node.mount.mounts.indexOf(mount);
        node.mount.mounts.splice(idx, 1)
    },
    lookup: function (parent, name) {
        return parent.node_ops.lookup(parent, name)
    },
    mknod: function (path, mode, dev) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === "." || name === "..") {
            throw new FS.ErrnoError(28)
        }
        var errCode = FS.mayCreate(parent, name);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        if (!parent.node_ops.mknod) {
            throw new FS.ErrnoError(63)
        }
        return parent.node_ops.mknod(parent, name, mode, dev)
    },
    create: function (path, mode) {
        mode = mode !== undefined ? mode : 438;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0)
    },
    mkdir: function (path, mode) {
        mode = mode !== undefined ? mode : 511;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0)
    },
    mkdirTree: function (path, mode) {
        var dirs = path.split("/");
        var d = "";
        for (var i = 0; i < dirs.length; ++i) {
            if (!dirs[i]) continue;
            d += "/" + dirs[i];
            try {
                FS.mkdir(d, mode)
            } catch (e) {
                if (e.errno != 20) throw e
            }
        }
    },
    mkdev: function (path, mode, dev) {
        if (typeof dev === "undefined") {
            dev = mode;
            mode = 438
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev)
    },
    symlink: function (oldpath, newpath) {
        if (!PATH_FS.resolve(oldpath)) {
            throw new FS.ErrnoError(44)
        }
        var lookup = FS.lookupPath(newpath, {
            parent: true
        });
        var parent = lookup.node;
        if (!parent) {
            throw new FS.ErrnoError(44)
        }
        var newname = PATH.basename(newpath);
        var errCode = FS.mayCreate(parent, newname);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        if (!parent.node_ops.symlink) {
            throw new FS.ErrnoError(63)
        }
        return parent.node_ops.symlink(parent, newname, oldpath)
    },
    rename: function (old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        var lookup, old_dir, new_dir;
        lookup = FS.lookupPath(old_path, {
            parent: true
        });
        old_dir = lookup.node;
        lookup = FS.lookupPath(new_path, {
            parent: true
        });
        new_dir = lookup.node;
        if (!old_dir || !new_dir) throw new FS.ErrnoError(44);
        if (old_dir.mount !== new_dir.mount) {
            throw new FS.ErrnoError(75)
        }
        var old_node = FS.lookupNode(old_dir, old_name);
        var relative = PATH_FS.relative(old_path, new_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(28)
        }
        relative = PATH_FS.relative(new_path, old_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(55)
        }
        var new_node;
        try {
            new_node = FS.lookupNode(new_dir, new_name)
        } catch (e) {}
        if (old_node === new_node) {
            return
        }
        var isdir = FS.isDir(old_node.mode);
        var errCode = FS.mayDelete(old_dir, old_name, isdir);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        errCode = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        if (!old_dir.node_ops.rename) {
            throw new FS.ErrnoError(63)
        }
        if (FS.isMountpoint(old_node) || new_node && FS.isMountpoint(new_node)) {
            throw new FS.ErrnoError(10)
        }
        if (new_dir !== old_dir) {
            errCode = FS.nodePermissions(old_dir, "w");
            if (errCode) {
                throw new FS.ErrnoError(errCode)
            }
        }
        FS.hashRemoveNode(old_node);
        try {
            old_dir.node_ops.rename(old_node, new_dir, new_name)
        } catch (e) {
            throw e
        } finally {
            FS.hashAddNode(old_node)
        }
    },
    rmdir: function (path) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, true);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        if (!parent.node_ops.rmdir) {
            throw new FS.ErrnoError(63)
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10)
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node)
    },
    readdir: function (path) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
            throw new FS.ErrnoError(54)
        }
        return node.node_ops.readdir(node)
    },
    unlink: function (path) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        if (!parent) {
            throw new FS.ErrnoError(44)
        }
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var errCode = FS.mayDelete(parent, name, false);
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        if (!parent.node_ops.unlink) {
            throw new FS.ErrnoError(63)
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(10)
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node)
    },
    readlink: function (path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
            throw new FS.ErrnoError(44)
        }
        if (!link.node_ops.readlink) {
            throw new FS.ErrnoError(28)
        }
        return PATH_FS.resolve(FS.getPath(link.parent), link.node_ops.readlink(link))
    },
    stat: function (path, dontFollow) {
        var lookup = FS.lookupPath(path, {
            follow: !dontFollow
        });
        var node = lookup.node;
        if (!node) {
            throw new FS.ErrnoError(44)
        }
        if (!node.node_ops.getattr) {
            throw new FS.ErrnoError(63)
        }
        return node.node_ops.getattr(node)
    },
    lstat: function (path) {
        return FS.stat(path, true)
    },
    chmod: function (path, mode, dontFollow) {
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, {
                follow: !dontFollow
            });
            node = lookup.node
        } else {
            node = path
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(63)
        }
        node.node_ops.setattr(node, {
            mode: mode & 4095 | node.mode & ~4095,
            timestamp: Date.now()
        })
    },
    lchmod: function (path, mode) {
        FS.chmod(path, mode, true)
    },
    fchmod: function (fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(8)
        }
        FS.chmod(stream.node, mode)
    },
    chown: function (path, uid, gid, dontFollow) {
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, {
                follow: !dontFollow
            });
            node = lookup.node
        } else {
            node = path
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(63)
        }
        node.node_ops.setattr(node, {
            timestamp: Date.now()
        })
    },
    lchown: function (path, uid, gid) {
        FS.chown(path, uid, gid, true)
    },
    fchown: function (fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(8)
        }
        FS.chown(stream.node, uid, gid)
    },
    truncate: function (path, len) {
        if (len < 0) {
            throw new FS.ErrnoError(28)
        }
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, {
                follow: true
            });
            node = lookup.node
        } else {
            node = path
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(63)
        }
        if (FS.isDir(node.mode)) {
            throw new FS.ErrnoError(31)
        }
        if (!FS.isFile(node.mode)) {
            throw new FS.ErrnoError(28)
        }
        var errCode = FS.nodePermissions(node, "w");
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        node.node_ops.setattr(node, {
            size: len,
            timestamp: Date.now()
        })
    },
    ftruncate: function (fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(8)
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(28)
        }
        FS.truncate(stream.node, len)
    },
    utime: function (path, atime, mtime) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        var node = lookup.node;
        node.node_ops.setattr(node, {
            timestamp: Math.max(atime, mtime)
        })
    },
    open: function (path, flags, mode, fd_start, fd_end) {
        if (path === "") {
            throw new FS.ErrnoError(44)
        }
        flags = typeof flags === "string" ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === "undefined" ? 438 : mode;
        if (flags & 64) {
            mode = mode & 4095 | 32768
        } else {
            mode = 0
        }
        var node;
        if (typeof path === "object") {
            node = path
        } else {
            path = PATH.normalize(path);
            try {
                var lookup = FS.lookupPath(path, {
                    follow: !(flags & 131072)
                });
                node = lookup.node
            } catch (e) {}
        }
        var created = false;
        if (flags & 64) {
            if (node) {
                if (flags & 128) {
                    throw new FS.ErrnoError(20)
                }
            } else {
                node = FS.mknod(path, mode, 0);
                created = true
            }
        }
        if (!node) {
            throw new FS.ErrnoError(44)
        }
        if (FS.isChrdev(node.mode)) {
            flags &= ~512
        }
        if (flags & 65536 && !FS.isDir(node.mode)) {
            throw new FS.ErrnoError(54)
        }
        if (!created) {
            var errCode = FS.mayOpen(node, flags);
            if (errCode) {
                throw new FS.ErrnoError(errCode)
            }
        }
        if (flags & 512) {
            FS.truncate(node, 0)
        }
        flags &= ~(128 | 512 | 131072);
        var stream = FS.createStream({
            node: node,
            path: FS.getPath(node),
            id: node.id,
            flags: flags,
            mode: node.mode,
            seekable: true,
            position: 0,
            stream_ops: node.stream_ops,
            node_ops: node.node_ops,
            ungotten: [],
            error: false
        }, fd_start, fd_end);
        if (stream.stream_ops.open) {
            stream.stream_ops.open(stream)
        }
        if (Module["logReadFiles"] && !(flags & 1)) {
            if (!FS.readFiles) FS.readFiles = {};
            if (!(path in FS.readFiles)) {
                FS.readFiles[path] = 1
            }
        }
        return stream
    },
    close: function (stream) {
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8)
        }
        if (stream.getdents) stream.getdents = null;
        try {
            if (stream.stream_ops.close) {
                stream.stream_ops.close(stream)
            }
        } catch (e) {
            throw e
        } finally {
            FS.closeStream(stream.fd)
        }
        stream.fd = null
    },
    isClosed: function (stream) {
        return stream.fd === null
    },
    llseek: function (stream, offset, whence) {
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8)
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
            throw new FS.ErrnoError(70)
        }
        if (whence != 0 && whence != 1 && whence != 2) {
            throw new FS.ErrnoError(28)
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position
    },
    read: function (stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(28)
        }
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8)
        }
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(8)
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(31)
        }
        if (!stream.stream_ops.read) {
            throw new FS.ErrnoError(28)
        }
        var seeking = typeof position !== "undefined";
        if (!seeking) {
            position = stream.position
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(70)
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead
    },
    write: function (stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(28)
        }
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8)
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(8)
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(31)
        }
        if (!stream.stream_ops.write) {
            throw new FS.ErrnoError(28)
        }
        if (stream.seekable && stream.flags & 1024) {
            FS.llseek(stream, 0, 2)
        }
        var seeking = typeof position !== "undefined";
        if (!seeking) {
            position = stream.position
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(70)
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        return bytesWritten
    },
    allocate: function (stream, offset, length) {
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(8)
        }
        if (offset < 0 || length <= 0) {
            throw new FS.ErrnoError(28)
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(8)
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(43)
        }
        if (!stream.stream_ops.allocate) {
            throw new FS.ErrnoError(138)
        }
        stream.stream_ops.allocate(stream, offset, length)
    },
    mmap: function (stream, address, length, position, prot, flags) {
        if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
            throw new FS.ErrnoError(2)
        }
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(2)
        }
        if (!stream.stream_ops.mmap) {
            throw new FS.ErrnoError(43)
        }
        return stream.stream_ops.mmap(stream, address, length, position, prot, flags)
    },
    msync: function (stream, buffer, offset, length, mmapFlags) {
        if (!stream || !stream.stream_ops.msync) {
            return 0
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags)
    },
    munmap: function (stream) {
        return 0
    },
    ioctl: function (stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
            throw new FS.ErrnoError(59)
        }
        return stream.stream_ops.ioctl(stream, cmd, arg)
    },
    readFile: function (path, opts = {}) {
        opts.flags = opts.flags || 0;
        opts.encoding = opts.encoding || "binary";
        if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
            throw new Error('Invalid encoding type "' + opts.encoding + '"')
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === "utf8") {
            ret = UTF8ArrayToString(buf, 0)
        } else if (opts.encoding === "binary") {
            ret = buf
        }
        FS.close(stream);
        return ret
    },
    writeFile: function (path, data, opts = {}) {
        opts.flags = opts.flags || 577;
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data === "string") {
            var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
            var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
            FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn)
        } else if (ArrayBuffer.isView(data)) {
            FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn)
        } else {
            throw new Error("Unsupported data type")
        }
        FS.close(stream)
    },
    cwd: function () {
        return FS.currentPath
    },
    chdir: function (path) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        if (lookup.node === null) {
            throw new FS.ErrnoError(44)
        }
        if (!FS.isDir(lookup.node.mode)) {
            throw new FS.ErrnoError(54)
        }
        var errCode = FS.nodePermissions(lookup.node, "x");
        if (errCode) {
            throw new FS.ErrnoError(errCode)
        }
        FS.currentPath = lookup.path
    },
    createDefaultDirectories: function () {
        FS.mkdir("/tmp");
        FS.mkdir("/home");
        FS.mkdir("/home/web_user")
    },
    createDefaultDevices: function () {
        FS.mkdir("/dev");
        FS.registerDevice(FS.makedev(1, 3), {
            read: function () {
                return 0
            },
            write: function (stream, buffer, offset, length, pos) {
                return length
            }
        });
        FS.mkdev("/dev/null", FS.makedev(1, 3));
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev("/dev/tty", FS.makedev(5, 0));
        FS.mkdev("/dev/tty1", FS.makedev(6, 0));
        var random_device = getRandomDevice();
        FS.createDevice("/dev", "random", random_device);
        FS.createDevice("/dev", "urandom", random_device);
        FS.mkdir("/dev/shm");
        FS.mkdir("/dev/shm/tmp")
    },
    createSpecialDirectories: function () {
        FS.mkdir("/proc");
        var proc_self = FS.mkdir("/proc/self");
        FS.mkdir("/proc/self/fd");
        FS.mount({
            mount: function () {
                var node = FS.createNode(proc_self, "fd", 16384 | 511, 73);
                node.node_ops = {
                    lookup: function (parent, name) {
                        var fd = +name;
                        var stream = FS.getStream(fd);
                        if (!stream) throw new FS.ErrnoError(8);
                        var ret = {
                            parent: null,
                            mount: {
                                mountpoint: "fake"
                            },
                            node_ops: {
                                readlink: function () {
                                    return stream.path
                                }
                            }
                        };
                        ret.parent = ret;
                        return ret
                    }
                };
                return node
            }
        }, {}, "/proc/self/fd")
    },
    createStandardStreams: function () {
        if (Module["stdin"]) {
            FS.createDevice("/dev", "stdin", Module["stdin"])
        } else {
            FS.symlink("/dev/tty", "/dev/stdin")
        }
        if (Module["stdout"]) {
            FS.createDevice("/dev", "stdout", null, Module["stdout"])
        } else {
            FS.symlink("/dev/tty", "/dev/stdout")
        }
        if (Module["stderr"]) {
            FS.createDevice("/dev", "stderr", null, Module["stderr"])
        } else {
            FS.symlink("/dev/tty1", "/dev/stderr")
        }
        var stdin = FS.open("/dev/stdin", 0);
        var stdout = FS.open("/dev/stdout", 1);
        var stderr = FS.open("/dev/stderr", 1)
    },
    ensureErrnoError: function () {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
            this.node = node;
            this.setErrno = function (errno) {
                this.errno = errno
            };
            this.setErrno(errno);
            this.message = "FS error"
        };
        FS.ErrnoError.prototype = new Error;
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        [44].forEach(function (code) {
            FS.genericErrors[code] = new FS.ErrnoError(code);
            FS.genericErrors[code].stack = "<generic error, no stack>"
        })
    },
    staticInit: function () {
        FS.ensureErrnoError();
        FS.nameTable = new Array(4096);
        FS.mount(MEMFS, {}, "/");
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
        FS.filesystems = {
            "MEMFS": MEMFS
        }
    },
    init: function (input, output, error) {
        FS.init.initialized = true;
        FS.ensureErrnoError();
        Module["stdin"] = input || Module["stdin"];
        Module["stdout"] = output || Module["stdout"];
        Module["stderr"] = error || Module["stderr"];
        FS.createStandardStreams()
    },
    quit: function () {
        FS.init.initialized = false;
        for (var i = 0; i < FS.streams.length; i++) {
            var stream = FS.streams[i];
            if (!stream) {
                continue
            }
            FS.close(stream)
        }
    },
    getMode: function (canRead, canWrite) {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode
    },
    findObject: function (path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
            return ret.object
        } else {
            return null
        }
    },
    analyzePath: function (path, dontResolveLastLink) {
        try {
            var lookup = FS.lookupPath(path, {
                follow: !dontResolveLastLink
            });
            path = lookup.path
        } catch (e) {}
        var ret = {
            isRoot: false,
            exists: false,
            error: 0,
            name: null,
            path: null,
            object: null,
            parentExists: false,
            parentPath: null,
            parentObject: null
        };
        try {
            var lookup = FS.lookupPath(path, {
                parent: true
            });
            ret.parentExists = true;
            ret.parentPath = lookup.path;
            ret.parentObject = lookup.node;
            ret.name = PATH.basename(path);
            lookup = FS.lookupPath(path, {
                follow: !dontResolveLastLink
            });
            ret.exists = true;
            ret.path = lookup.path;
            ret.object = lookup.node;
            ret.name = lookup.node.name;
            ret.isRoot = lookup.path === "/"
        } catch (e) {
            ret.error = e.errno
        }
        return ret
    },
    createPath: function (parent, path, canRead, canWrite) {
        parent = typeof parent === "string" ? parent : FS.getPath(parent);
        var parts = path.split("/").reverse();
        while (parts.length) {
            var part = parts.pop();
            if (!part) continue;
            var current = PATH.join2(parent, part);
            try {
                FS.mkdir(current)
            } catch (e) {}
            parent = current
        }
        return current
    },
    createFile: function (parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode)
    },
    createDataFile: function (parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
            if (typeof data === "string") {
                var arr = new Array(data.length);
                for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
                data = arr
            }
            FS.chmod(node, mode | 146);
            var stream = FS.open(node, 577);
            FS.write(stream, data, 0, data.length, 0, canOwn);
            FS.close(stream);
            FS.chmod(node, mode)
        }
        return node
    },
    createDevice: function (parent, name, input, output) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        FS.registerDevice(dev, {
            open: function (stream) {
                stream.seekable = false
            },
            close: function (stream) {
                if (output && output.buffer && output.buffer.length) {
                    output(10)
                }
            },
            read: function (stream, buffer, offset, length, pos) {
                var bytesRead = 0;
                for (var i = 0; i < length; i++) {
                    var result;
                    try {
                        result = input()
                    } catch (e) {
                        throw new FS.ErrnoError(29)
                    }
                    if (result === undefined && bytesRead === 0) {
                        throw new FS.ErrnoError(6)
                    }
                    if (result === null || result === undefined) break;
                    bytesRead++;
                    buffer[offset + i] = result
                }
                if (bytesRead) {
                    stream.node.timestamp = Date.now()
                }
                return bytesRead
            },
            write: function (stream, buffer, offset, length, pos) {
                for (var i = 0; i < length; i++) {
                    try {
                        output(buffer[offset + i])
                    } catch (e) {
                        throw new FS.ErrnoError(29)
                    }
                }
                if (length) {
                    stream.node.timestamp = Date.now()
                }
                return i
            }
        });
        return FS.mkdev(path, mode, dev)
    },
    forceLoadFile: function (obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        if (typeof XMLHttpRequest !== "undefined") {
            throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")
        } else if (read_) {
            try {
                obj.contents = intArrayFromString(read_(obj.url), true);
                obj.usedBytes = obj.contents.length
            } catch (e) {
                throw new FS.ErrnoError(29)
            }
        } else {
            throw new Error("Cannot load without read() or XMLHttpRequest.")
        }
    },
    createLazyFile: function (parent, name, url, canRead, canWrite) {
        function LazyUint8Array() {
            this.lengthKnown = false;
            this.chunks = []
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
            if (idx > this.length - 1 || idx < 0) {
                return undefined
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = idx / this.chunkSize | 0;
            return this.getter(chunkNum)[chunkOffset]
        };
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
            this.getter = getter
        };
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
            var xhr = new XMLHttpRequest;
            xhr.open("HEAD", url, false);
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            var datalength = Number(xhr.getResponseHeader("Content-length"));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
            var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
            var chunkSize = 1024 * 1024;
            if (!hasByteServing) chunkSize = datalength;
            var doXHR = function (from, to) {
                if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
                if (to > datalength - 1) throw new Error("only " + datalength + " bytes available! programmer error!");
                var xhr = new XMLHttpRequest;
                xhr.open("GET", url, false);
                if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
                if (typeof Uint8Array != "undefined") xhr.responseType = "arraybuffer";
                if (xhr.overrideMimeType) {
                    xhr.overrideMimeType("text/plain; charset=x-user-defined")
                }
                xhr.send(null);
                if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
                if (xhr.response !== undefined) {
                    return new Uint8Array(xhr.response || [])
                } else {
                    return intArrayFromString(xhr.responseText || "", true)
                }
            };
            var lazyArray = this;
            lazyArray.setDataGetter(function (chunkNum) {
                var start = chunkNum * chunkSize;
                var end = (chunkNum + 1) * chunkSize - 1;
                end = Math.min(end, datalength - 1);
                if (typeof lazyArray.chunks[chunkNum] === "undefined") {
                    lazyArray.chunks[chunkNum] = doXHR(start, end)
                }
                if (typeof lazyArray.chunks[chunkNum] === "undefined") throw new Error("doXHR failed!");
                return lazyArray.chunks[chunkNum]
            });
            if (usesGzip || !datalength) {
                chunkSize = datalength = 1;
                datalength = this.getter(0).length;
                chunkSize = datalength;
                out("LazyFiles on gzip forces download of the whole file when length is accessed")
            }
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true
        };
        if (typeof XMLHttpRequest !== "undefined") {
            if (!ENVIRONMENT_IS_WORKER) throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
            var lazyArray = new LazyUint8Array;
            Object.defineProperties(lazyArray, {
                length: {
                    get: function () {
                        if (!this.lengthKnown) {
                            this.cacheLength()
                        }
                        return this._length
                    }
                },
                chunkSize: {
                    get: function () {
                        if (!this.lengthKnown) {
                            this.cacheLength()
                        }
                        return this._chunkSize
                    }
                }
            });
            var properties = {
                isDevice: false,
                contents: lazyArray
            }
        } else {
            var properties = {
                isDevice: false,
                url: url
            }
        }
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        if (properties.contents) {
            node.contents = properties.contents
        } else if (properties.url) {
            node.contents = null;
            node.url = properties.url
        }
        Object.defineProperties(node, {
            usedBytes: {
                get: function () {
                    return this.contents.length
                }
            }
        });
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach(function (key) {
            var fn = node.stream_ops[key];
            stream_ops[key] = function forceLoadLazyFile() {
                FS.forceLoadFile(node);
                return fn.apply(null, arguments)
            }
        });
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
            FS.forceLoadFile(node);
            var contents = stream.node.contents;
            if (position >= contents.length) return 0;
            var size = Math.min(contents.length - position, length);
            if (contents.slice) {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents[position + i]
                }
            } else {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents.get(position + i)
                }
            }
            return size
        };
        node.stream_ops = stream_ops;
        return node
    },
    createPreloadedFile: function (parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        Browser.init();
        var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency("cp " + fullname);

        function processData(byteArray) {
            function finish(byteArray) {
                if (preFinish) preFinish();
                if (!dontCreateFile) {
                    FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn)
                }
                if (onload) onload();
                removeRunDependency(dep)
            }
            var handled = false;
            Module["preloadPlugins"].forEach(function (plugin) {
                if (handled) return;
                if (plugin["canHandle"](fullname)) {
                    plugin["handle"](byteArray, fullname, finish, function () {
                        if (onerror) onerror();
                        removeRunDependency(dep)
                    });
                    handled = true
                }
            });
            if (!handled) finish(byteArray)
        }
        addRunDependency(dep);
        if (typeof url == "string") {
            asyncLoad(url, function (byteArray) {
                processData(byteArray)
            }, onerror)
        } else {
            processData(url)
        }
    },
    indexedDB: function () {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB
    },
    DB_NAME: function () {
        return "EM_FS_" + window.location.pathname
    },
    DB_VERSION: 20,
    DB_STORE_NAME: "FILE_DATA",
    saveFilesToDB: function (paths, onload, onerror) {
        onload = onload || function () {};
        onerror = onerror || function () {};
        var indexedDB = FS.indexedDB();
        try {
            var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION)
        } catch (e) {
            return onerror(e)
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
            out("creating db");
            var db = openRequest.result;
            db.createObjectStore(FS.DB_STORE_NAME)
        };
        openRequest.onsuccess = function openRequest_onsuccess() {
            var db = openRequest.result;
            var transaction = db.transaction([FS.DB_STORE_NAME], "readwrite");
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0,
                fail = 0,
                total = paths.length;

            function finish() {
                if (fail == 0) onload();
                else onerror()
            }
            paths.forEach(function (path) {
                var putRequest = files.put(FS.analyzePath(path).object.contents, path);
                putRequest.onsuccess = function putRequest_onsuccess() {
                    ok++;
                    if (ok + fail == total) finish()
                };
                putRequest.onerror = function putRequest_onerror() {
                    fail++;
                    if (ok + fail == total) finish()
                }
            });
            transaction.onerror = onerror
        };
        openRequest.onerror = onerror
    },
    loadFilesFromDB: function (paths, onload, onerror) {
        onload = onload || function () {};
        onerror = onerror || function () {};
        var indexedDB = FS.indexedDB();
        try {
            var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION)
        } catch (e) {
            return onerror(e)
        }
        openRequest.onupgradeneeded = onerror;
        openRequest.onsuccess = function openRequest_onsuccess() {
            var db = openRequest.result;
            try {
                var transaction = db.transaction([FS.DB_STORE_NAME], "readonly")
            } catch (e) {
                onerror(e);
                return
            }
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0,
                fail = 0,
                total = paths.length;

            function finish() {
                if (fail == 0) onload();
                else onerror()
            }
            paths.forEach(function (path) {
                var getRequest = files.get(path);
                getRequest.onsuccess = function getRequest_onsuccess() {
                    if (FS.analyzePath(path).exists) {
                        FS.unlink(path)
                    }
                    FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
                    ok++;
                    if (ok + fail == total) finish()
                };
                getRequest.onerror = function getRequest_onerror() {
                    fail++;
                    if (ok + fail == total) finish()
                }
            });
            transaction.onerror = onerror
        };
        openRequest.onerror = onerror
    }
};
var SYSCALLS = {
    mappings: {},
    DEFAULT_POLLMASK: 5,
    calculateAt: function (dirfd, path, allowEmpty) {
        if (path[0] === "/") {
            return path
        }
        var dir;
        if (dirfd === -100) {
            dir = FS.cwd()
        } else {
            var dirstream = FS.getStream(dirfd);
            if (!dirstream) throw new FS.ErrnoError(8);
            dir = dirstream.path
        }
        if (path.length == 0) {
            if (!allowEmpty) {
                throw new FS.ErrnoError(44)
            }
            return dir
        }
        return PATH.join2(dir, path)
    },
    doStat: function (func, path, buf) {
        try {
            var stat = func(path)
        } catch (e) {
            if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
                return -54
            }
            throw e
        }
        HEAP32[buf >> 2] = stat.dev;
        HEAP32[buf + 4 >> 2] = 0;
        HEAP32[buf + 8 >> 2] = stat.ino;
        HEAP32[buf + 12 >> 2] = stat.mode;
        HEAP32[buf + 16 >> 2] = stat.nlink;
        HEAP32[buf + 20 >> 2] = stat.uid;
        HEAP32[buf + 24 >> 2] = stat.gid;
        HEAP32[buf + 28 >> 2] = stat.rdev;
        HEAP32[buf + 32 >> 2] = 0;
        tempI64 = [stat.size >>> 0, (tempDouble = stat.size, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 40 >> 2] = tempI64[0], HEAP32[buf + 44 >> 2] = tempI64[1];
        HEAP32[buf + 48 >> 2] = 4096;
        HEAP32[buf + 52 >> 2] = stat.blocks;
        HEAP32[buf + 56 >> 2] = stat.atime.getTime() / 1e3 | 0;
        HEAP32[buf + 60 >> 2] = 0;
        HEAP32[buf + 64 >> 2] = stat.mtime.getTime() / 1e3 | 0;
        HEAP32[buf + 68 >> 2] = 0;
        HEAP32[buf + 72 >> 2] = stat.ctime.getTime() / 1e3 | 0;
        HEAP32[buf + 76 >> 2] = 0;
        tempI64 = [stat.ino >>> 0, (tempDouble = stat.ino, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[buf + 80 >> 2] = tempI64[0], HEAP32[buf + 84 >> 2] = tempI64[1];
        return 0
    },
    doMsync: function (addr, stream, len, flags, offset) {
        var buffer = HEAPU8.slice(addr, addr + len);
        FS.msync(stream, buffer, offset, len, flags)
    },
    doMkdir: function (path, mode) {
        path = PATH.normalize(path);
        if (path[path.length - 1] === "/") path = path.substr(0, path.length - 1);
        FS.mkdir(path, mode, 0);
        return 0
    },
    doMknod: function (path, mode, dev) {
        switch (mode & 61440) {
            case 32768:
            case 8192:
            case 24576:
            case 4096:
            case 49152:
                break;
            default:
                return -28
        }
        FS.mknod(path, mode, dev);
        return 0
    },
    doReadlink: function (path, buf, bufsize) {
        if (bufsize <= 0) return -28;
        var ret = FS.readlink(path);
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = HEAP8[buf + len];
        stringToUTF8(ret, buf, bufsize + 1);
        HEAP8[buf + len] = endChar;
        return len
    },
    doAccess: function (path, amode) {
        if (amode & ~7) {
            return -28
        }
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        var node = lookup.node;
        if (!node) {
            return -44
        }
        var perms = "";
        if (amode & 4) perms += "r";
        if (amode & 2) perms += "w";
        if (amode & 1) perms += "x";
        if (perms && FS.nodePermissions(node, perms)) {
            return -2
        }
        return 0
    },
    doDup: function (path, flags, suggestFD) {
        var suggest = FS.getStream(suggestFD);
        if (suggest) FS.close(suggest);
        return FS.open(path, flags, 0, suggestFD, suggestFD).fd
    },
    doReadv: function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
            var ptr = HEAP32[iov + i * 8 >> 2];
            var len = HEAP32[iov + (i * 8 + 4) >> 2];
            var curr = FS.read(stream, HEAP8, ptr, len, offset);
            if (curr < 0) return -1;
            ret += curr;
            if (curr < len) break
        }
        return ret
    },
    doWritev: function (stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
            var ptr = HEAP32[iov + i * 8 >> 2];
            var len = HEAP32[iov + (i * 8 + 4) >> 2];
            var curr = FS.write(stream, HEAP8, ptr, len, offset);
            if (curr < 0) return -1;
            ret += curr
        }
        return ret
    },
    varargs: undefined,
    get: function () {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[SYSCALLS.varargs - 4 >> 2];
        return ret
    },
    getStr: function (ptr) {
        var ret = UTF8ToString(ptr);
        return ret
    },
    getStreamFromFD: function (fd) {
        var stream = FS.getStream(fd);
        if (!stream) throw new FS.ErrnoError(8);
        return stream
    },
    get64: function (low, high) {
        return low
    }
};

function ___syscall_fcntl64(fd, cmd, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        switch (cmd) {
            case 0: {
                var arg = SYSCALLS.get();
                if (arg < 0) {
                    return -28
                }
                var newStream;
                newStream = FS.open(stream.path, stream.flags, 0, arg);
                return newStream.fd
            }
            case 1:
            case 2:
                return 0;
            case 3:
                return stream.flags;
            case 4: {
                var arg = SYSCALLS.get();
                stream.flags |= arg;
                return 0
            }
            case 5: {
                var arg = SYSCALLS.get();
                var offset = 0;
                HEAP16[arg + offset >> 1] = 2;
                return 0
            }
            case 6:
            case 7:
                return 0;
            case 16:
            case 8:
                return -28;
            case 9:
                setErrNo(28);
                return -1;
            default: {
                return -28
            }
        }
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) throw e;
        return -e.errno
    }
}

function ___syscall_ioctl(fd, op, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        switch (op) {
            case 21509:
            case 21505: {
                if (!stream.tty) return -59;
                return 0
            }
            case 21510:
            case 21511:
            case 21512:
            case 21506:
            case 21507:
            case 21508: {
                if (!stream.tty) return -59;
                return 0
            }
            case 21519: {
                if (!stream.tty) return -59;
                var argp = SYSCALLS.get();
                HEAP32[argp >> 2] = 0;
                return 0
            }
            case 21520: {
                if (!stream.tty) return -59;
                return -28
            }
            case 21531: {
                var argp = SYSCALLS.get();
                return FS.ioctl(stream, op, argp)
            }
            case 21523: {
                if (!stream.tty) return -59;
                return 0
            }
            case 21524: {
                if (!stream.tty) return -59;
                return 0
            }
            default:
                abort("bad ioctl syscall " + op)
        }
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) throw e;
        return -e.errno
    }
}

function ___syscall_open(path, flags, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var pathname = SYSCALLS.getStr(path);
        var mode = varargs ? SYSCALLS.get() : 0;
        var stream = FS.open(pathname, flags, mode);
        return stream.fd
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) throw e;
        return -e.errno
    }
}

function _abort() {
    abort("")
}

function _emscripten_memcpy_big(dest, src, num) {
    HEAPU8.copyWithin(dest, src, src + num)
}

function abortOnCannotGrowMemory(requestedSize) {
    abort("OOM")
}

function _emscripten_resize_heap(requestedSize) {
    var oldSize = HEAPU8.length;
    requestedSize = requestedSize >>> 0;
    abortOnCannotGrowMemory(requestedSize)
}
var ENV = {};

function getExecutableName() {
    return thisProgram || "./this.program"
}

function getEnvStrings() {
    if (!getEnvStrings.strings) {
        var lang = (typeof navigator === "object" && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8";
        var env = {
            "USER": "web_user",
            "LOGNAME": "web_user",
            "PATH": "/",
            "PWD": "/",
            "HOME": "/home/web_user",
            "LANG": lang,
            "_": getExecutableName()
        };
        for (var x in ENV) {
            if (ENV[x] === undefined) delete env[x];
            else env[x] = ENV[x]
        }
        var strings = [];
        for (var x in env) {
            strings.push(x + "=" + env[x])
        }
        getEnvStrings.strings = strings
    }
    return getEnvStrings.strings
}

function _environ_get(__environ, environ_buf) {
    var bufSize = 0;
    getEnvStrings().forEach(function (string, i) {
        var ptr = environ_buf + bufSize;
        HEAP32[__environ + i * 4 >> 2] = ptr;
        writeAsciiToMemory(string, ptr);
        bufSize += string.length + 1
    });
    return 0
}

function _environ_sizes_get(penviron_count, penviron_buf_size) {
    var strings = getEnvStrings();
    HEAP32[penviron_count >> 2] = strings.length;
    var bufSize = 0;
    strings.forEach(function (string) {
        bufSize += string.length + 1
    });
    HEAP32[penviron_buf_size >> 2] = bufSize;
    return 0
}

function _exit(status) {
    exit(status)
}

function _fd_close(fd) {
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        FS.close(stream);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) throw e;
        return e.errno
    }
}

function _fd_read(fd, iov, iovcnt, pnum) {
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        var num = SYSCALLS.doReadv(stream, iov, iovcnt);
        HEAP32[pnum >> 2] = num;
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) throw e;
        return e.errno
    }
}

function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        var HIGH_OFFSET = 4294967296;
        var offset = offset_high * HIGH_OFFSET + (offset_low >>> 0);
        var DOUBLE_LIMIT = 9007199254740992;
        if (offset <= -DOUBLE_LIMIT || offset >= DOUBLE_LIMIT) {
            return -61
        }
        FS.llseek(stream, offset, whence);
        tempI64 = [stream.position >>> 0, (tempDouble = stream.position, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math.min(+Math.floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[newOffset >> 2] = tempI64[0], HEAP32[newOffset + 4 >> 2] = tempI64[1];
        if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) throw e;
        return e.errno
    }
}

function _fd_write(fd, iov, iovcnt, pnum) {
    try {
        var stream = SYSCALLS.getStreamFromFD(fd);
        var num = SYSCALLS.doWritev(stream, iov, iovcnt);
        HEAP32[pnum >> 2] = num;
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) throw e;
        return e.errno
    }
}

function _gettimeofday(ptr) {
    var now = Date.now();
    HEAP32[ptr >> 2] = now / 1e3 | 0;
    HEAP32[ptr + 4 >> 2] = now % 1e3 * 1e3 | 0;
    return 0
}

function __isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function __arraySum(array, index) {
    var sum = 0;
    for (var i = 0; i <= index; sum += array[i++]) {}
    return sum
}
var __MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var __MONTH_DAYS_REGULAR = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function __addDays(date, days) {
    var newDate = new Date(date.getTime());
    while (days > 0) {
        var leap = __isLeapYear(newDate.getFullYear());
        var currentMonth = newDate.getMonth();
        var daysInCurrentMonth = (leap ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR)[currentMonth];
        if (days > daysInCurrentMonth - newDate.getDate()) {
            days -= daysInCurrentMonth - newDate.getDate() + 1;
            newDate.setDate(1);
            if (currentMonth < 11) {
                newDate.setMonth(currentMonth + 1)
            } else {
                newDate.setMonth(0);
                newDate.setFullYear(newDate.getFullYear() + 1)
            }
        } else {
            newDate.setDate(newDate.getDate() + days);
            return newDate
        }
    }
    return newDate
}

function _strftime(s, maxsize, format, tm) {
    var tm_zone = HEAP32[tm + 40 >> 2];
    var date = {
        tm_sec: HEAP32[tm >> 2],
        tm_min: HEAP32[tm + 4 >> 2],
        tm_hour: HEAP32[tm + 8 >> 2],
        tm_mday: HEAP32[tm + 12 >> 2],
        tm_mon: HEAP32[tm + 16 >> 2],
        tm_year: HEAP32[tm + 20 >> 2],
        tm_wday: HEAP32[tm + 24 >> 2],
        tm_yday: HEAP32[tm + 28 >> 2],
        tm_isdst: HEAP32[tm + 32 >> 2],
        tm_gmtoff: HEAP32[tm + 36 >> 2],
        tm_zone: tm_zone ? UTF8ToString(tm_zone) : ""
    };
    var pattern = UTF8ToString(format);
    var EXPANSION_RULES_1 = {
        "%c": "%a %b %d %H:%M:%S %Y",
        "%D": "%m/%d/%y",
        "%F": "%Y-%m-%d",
        "%h": "%b",
        "%r": "%I:%M:%S %p",
        "%R": "%H:%M",
        "%T": "%H:%M:%S",
        "%x": "%m/%d/%y",
        "%X": "%H:%M:%S",
        "%Ec": "%c",
        "%EC": "%C",
        "%Ex": "%m/%d/%y",
        "%EX": "%H:%M:%S",
        "%Ey": "%y",
        "%EY": "%Y",
        "%Od": "%d",
        "%Oe": "%e",
        "%OH": "%H",
        "%OI": "%I",
        "%Om": "%m",
        "%OM": "%M",
        "%OS": "%S",
        "%Ou": "%u",
        "%OU": "%U",
        "%OV": "%V",
        "%Ow": "%w",
        "%OW": "%W",
        "%Oy": "%y"
    };
    for (var rule in EXPANSION_RULES_1) {
        pattern = pattern.replace(new RegExp(rule, "g"), EXPANSION_RULES_1[rule])
    }
    var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    function leadingSomething(value, digits, character) {
        var str = typeof value === "number" ? value.toString() : value || "";
        while (str.length < digits) {
            str = character[0] + str
        }
        return str
    }

    function leadingNulls(value, digits) {
        return leadingSomething(value, digits, "0")
    }

    function compareByDay(date1, date2) {
        function sgn(value) {
            return value < 0 ? -1 : value > 0 ? 1 : 0
        }
        var compare;
        if ((compare = sgn(date1.getFullYear() - date2.getFullYear())) === 0) {
            if ((compare = sgn(date1.getMonth() - date2.getMonth())) === 0) {
                compare = sgn(date1.getDate() - date2.getDate())
            }
        }
        return compare
    }

    function getFirstWeekStartDate(janFourth) {
        switch (janFourth.getDay()) {
            case 0:
                return new Date(janFourth.getFullYear() - 1, 11, 29);
            case 1:
                return janFourth;
            case 2:
                return new Date(janFourth.getFullYear(), 0, 3);
            case 3:
                return new Date(janFourth.getFullYear(), 0, 2);
            case 4:
                return new Date(janFourth.getFullYear(), 0, 1);
            case 5:
                return new Date(janFourth.getFullYear() - 1, 11, 31);
            case 6:
                return new Date(janFourth.getFullYear() - 1, 11, 30)
        }
    }

    function getWeekBasedYear(date) {
        var thisDate = __addDays(new Date(date.tm_year + 1900, 0, 1), date.tm_yday);
        var janFourthThisYear = new Date(thisDate.getFullYear(), 0, 4);
        var janFourthNextYear = new Date(thisDate.getFullYear() + 1, 0, 4);
        var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
        var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
        if (compareByDay(firstWeekStartThisYear, thisDate) <= 0) {
            if (compareByDay(firstWeekStartNextYear, thisDate) <= 0) {
                return thisDate.getFullYear() + 1
            } else {
                return thisDate.getFullYear()
            }
        } else {
            return thisDate.getFullYear() - 1
        }
    }
    var EXPANSION_RULES_2 = {
        "%a": function (date) {
            return WEEKDAYS[date.tm_wday].substring(0, 3)
        },
        "%A": function (date) {
            return WEEKDAYS[date.tm_wday]
        },
        "%b": function (date) {
            return MONTHS[date.tm_mon].substring(0, 3)
        },
        "%B": function (date) {
            return MONTHS[date.tm_mon]
        },
        "%C": function (date) {
            var year = date.tm_year + 1900;
            return leadingNulls(year / 100 | 0, 2)
        },
        "%d": function (date) {
            return leadingNulls(date.tm_mday, 2)
        },
        "%e": function (date) {
            return leadingSomething(date.tm_mday, 2, " ")
        },
        "%g": function (date) {
            return getWeekBasedYear(date).toString().substring(2)
        },
        "%G": function (date) {
            return getWeekBasedYear(date)
        },
        "%H": function (date) {
            return leadingNulls(date.tm_hour, 2)
        },
        "%I": function (date) {
            var twelveHour = date.tm_hour;
            if (twelveHour == 0) twelveHour = 12;
            else if (twelveHour > 12) twelveHour -= 12;
            return leadingNulls(twelveHour, 2)
        },
        "%j": function (date) {
            return leadingNulls(date.tm_mday + __arraySum(__isLeapYear(date.tm_year + 1900) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, date.tm_mon - 1), 3)
        },
        "%m": function (date) {
            return leadingNulls(date.tm_mon + 1, 2)
        },
        "%M": function (date) {
            return leadingNulls(date.tm_min, 2)
        },
        "%n": function () {
            return "\n"
        },
        "%p": function (date) {
            if (date.tm_hour >= 0 && date.tm_hour < 12) {
                return "AM"
            } else {
                return "PM"
            }
        },
        "%S": function (date) {
            return leadingNulls(date.tm_sec, 2)
        },
        "%t": function () {
            return "\t"
        },
        "%u": function (date) {
            return date.tm_wday || 7
        },
        "%U": function (date) {
            var janFirst = new Date(date.tm_year + 1900, 0, 1);
            var firstSunday = janFirst.getDay() === 0 ? janFirst : __addDays(janFirst, 7 - janFirst.getDay());
            var endDate = new Date(date.tm_year + 1900, date.tm_mon, date.tm_mday);
            if (compareByDay(firstSunday, endDate) < 0) {
                var februaryFirstUntilEndMonth = __arraySum(__isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, endDate.getMonth() - 1) - 31;
                var firstSundayUntilEndJanuary = 31 - firstSunday.getDate();
                var days = firstSundayUntilEndJanuary + februaryFirstUntilEndMonth + endDate.getDate();
                return leadingNulls(Math.ceil(days / 7), 2)
            }
            return compareByDay(firstSunday, janFirst) === 0 ? "01" : "00"
        },
        "%V": function (date) {
            var janFourthThisYear = new Date(date.tm_year + 1900, 0, 4);
            var janFourthNextYear = new Date(date.tm_year + 1901, 0, 4);
            var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
            var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
            var endDate = __addDays(new Date(date.tm_year + 1900, 0, 1), date.tm_yday);
            if (compareByDay(endDate, firstWeekStartThisYear) < 0) {
                return "53"
            }
            if (compareByDay(firstWeekStartNextYear, endDate) <= 0) {
                return "01"
            }
            var daysDifference;
            if (firstWeekStartThisYear.getFullYear() < date.tm_year + 1900) {
                daysDifference = date.tm_yday + 32 - firstWeekStartThisYear.getDate()
            } else {
                daysDifference = date.tm_yday + 1 - firstWeekStartThisYear.getDate()
            }
            return leadingNulls(Math.ceil(daysDifference / 7), 2)
        },
        "%w": function (date) {
            return date.tm_wday
        },
        "%W": function (date) {
            var janFirst = new Date(date.tm_year, 0, 1);
            var firstMonday = janFirst.getDay() === 1 ? janFirst : __addDays(janFirst, janFirst.getDay() === 0 ? 1 : 7 - janFirst.getDay() + 1);
            var endDate = new Date(date.tm_year + 1900, date.tm_mon, date.tm_mday);
            if (compareByDay(firstMonday, endDate) < 0) {
                var februaryFirstUntilEndMonth = __arraySum(__isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, endDate.getMonth() - 1) - 31;
                var firstMondayUntilEndJanuary = 31 - firstMonday.getDate();
                var days = firstMondayUntilEndJanuary + februaryFirstUntilEndMonth + endDate.getDate();
                return leadingNulls(Math.ceil(days / 7), 2)
            }
            return compareByDay(firstMonday, janFirst) === 0 ? "01" : "00"
        },
        "%y": function (date) {
            return (date.tm_year + 1900).toString().substring(2)
        },
        "%Y": function (date) {
            return date.tm_year + 1900
        },
        "%z": function (date) {
            var off = date.tm_gmtoff;
            var ahead = off >= 0;
            off = Math.abs(off) / 60;
            off = off / 60 * 100 + off % 60;
            return (ahead ? "+" : "-") + String("0000" + off).slice(-4)
        },
        "%Z": function (date) {
            return date.tm_zone
        },
        "%%": function () {
            return "%"
        }
    };
    for (var rule in EXPANSION_RULES_2) {
        if (pattern.includes(rule)) {
            pattern = pattern.replace(new RegExp(rule, "g"), EXPANSION_RULES_2[rule](date))
        }
    }
    var bytes = intArrayFromString(pattern, false);
    if (bytes.length > maxsize) {
        return 0
    }
    writeArrayToMemory(bytes, s);
    return bytes.length - 1
}

function _strftime_l(s, maxsize, format, tm) {
    return _strftime(s, maxsize, format, tm)
}
var FSNode = function (parent, name, mode, rdev) {
    if (!parent) {
        parent = this
    }
    this.parent = parent;
    this.mount = parent.mount;
    this.mounted = null;
    this.id = FS.nextInode++;
    this.name = name;
    this.mode = mode;
    this.node_ops = {};
    this.stream_ops = {};
    this.rdev = rdev
};
var readMode = 292 | 73;
var writeMode = 146;
Object.defineProperties(FSNode.prototype, {
    read: {
        get: function () {
            return (this.mode & readMode) === readMode
        },
        set: function (val) {
            val ? this.mode |= readMode : this.mode &= ~readMode
        }
    },
    write: {
        get: function () {
            return (this.mode & writeMode) === writeMode
        },
        set: function (val) {
            val ? this.mode |= writeMode : this.mode &= ~writeMode
        }
    },
    isFolder: {
        get: function () {
            return FS.isDir(this.mode)
        }
    },
    isDevice: {
        get: function () {
            return FS.isChrdev(this.mode)
        }
    }
});
FS.FSNode = FSNode;
FS.staticInit();

function intArrayFromString(stringy, dontAddNull, length) {
    var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array
}
var asmLibraryArg = {
    "b": ___cxa_allocate_exception,
    "a": ___cxa_throw,
    "g": ___syscall_fcntl64,
    "j": ___syscall_ioctl,
    "k": ___syscall_open,
    "e": _abort,
    "l": _emscripten_memcpy_big,
    "o": _emscripten_resize_heap,
    "p": _environ_get,
    "q": _environ_sizes_get,
    "c": _exit,
    "h": _fd_close,
    "i": _fd_read,
    "m": _fd_seek,
    "f": _fd_write,
    "d": _gettimeofday,
    "n": _strftime_l
};
var asm = createWasm();
var ___wasm_call_ctors = Module["___wasm_call_ctors"] = function () {
    return (___wasm_call_ctors = Module["___wasm_call_ctors"] = Module["asm"]["s"]).apply(null, arguments)
};
var __ZN4cura8logErrorEPKcz = Module["__ZN4cura8logErrorEPKcz"] = function () {
    return (__ZN4cura8logErrorEPKcz = Module["__ZN4cura8logErrorEPKcz"] = Module["asm"]["t"]).apply(null, arguments)
};
var _main = Module["_main"] = function () {
    return (_main = Module["_main"] = Module["asm"]["u"]).apply(null, arguments)
};
var __ZN4cura11Application3runEmPPc = Module["__ZN4cura11Application3runEmPPc"] = function () {
    return (__ZN4cura11Application3runEmPPc = Module["__ZN4cura11Application3runEmPPc"] = Module["asm"]["v"]).apply(null, arguments)
};
var _myFunction = Module["_myFunction"] = function () {
    return (_myFunction = Module["_myFunction"] = Module["asm"]["w"]).apply(null, arguments)
};
var __ZNK4cura11Application9printCallEv = Module["__ZNK4cura11Application9printCallEv"] = function () {
    return (__ZNK4cura11Application9printCallEv = Module["__ZNK4cura11Application9printCallEv"] = Module["asm"]["y"]).apply(null, arguments)
};
var __ZNK4cura11Application9printHelpEv = Module["__ZNK4cura11Application9printHelpEv"] = function () {
    return (__ZNK4cura11Application9printHelpEv = Module["__ZNK4cura11Application9printHelpEv"] = Module["asm"]["z"]).apply(null, arguments)
};
var __ZN4cura9logAlwaysEPKcz = Module["__ZN4cura9logAlwaysEPKcz"] = function () {
    return (__ZN4cura9logAlwaysEPKcz = Module["__ZN4cura9logAlwaysEPKcz"] = Module["asm"]["A"]).apply(null, arguments)
};
var __ZNK4cura11Application12printLicenseEv = Module["__ZNK4cura11Application12printLicenseEv"] = function () {
    return (__ZNK4cura11Application12printLicenseEv = Module["__ZNK4cura11Application12printLicenseEv"] = Module["asm"]["B"]).apply(null, arguments)
};
var __ZN4cura11Application5sliceEv = Module["__ZN4cura11Application5sliceEv"] = function () {
    return (__ZN4cura11Application5sliceEv = Module["__ZN4cura11Application5sliceEv"] = Module["asm"]["C"]).apply(null, arguments)
};
var __ZN4cura3logEPKcz = Module["__ZN4cura3logEPKcz"] = function () {
    return (__ZN4cura3logEPKcz = Module["__ZN4cura3logEPKcz"] = Module["asm"]["D"]).apply(null, arguments)
};
var __ZN4cura11bridgeAngleERKNS_8SettingsERKNS_8PolygonsERKNS_16SliceDataStorageEjPKNS_12SupportLayerERS3_ = Module["__ZN4cura11bridgeAngleERKNS_8SettingsERKNS_8PolygonsERKNS_16SliceDataStorageEjPKNS_12SupportLayerERS3_"] = function () {
    return (__ZN4cura11bridgeAngleERKNS_8SettingsERKNS_8PolygonsERKNS_16SliceDataStorageEjPKNS_12SupportLayerERS3_ = Module["__ZN4cura11bridgeAngleERKNS_8SettingsERKNS_8PolygonsERKNS_16SliceDataStorageEjPKNS_12SupportLayerERS3_"] = Module["asm"]["E"]).apply(null, arguments)
};
var __ZN4cura15ConicalOverhang5applyEPNS_6SlicerERKNS_4MeshE = Module["__ZN4cura15ConicalOverhang5applyEPNS_6SlicerERKNS_4MeshE"] = function () {
    return (__ZN4cura15ConicalOverhang5applyEPNS_6SlicerERKNS_4MeshE = Module["__ZN4cura15ConicalOverhang5applyEPNS_6SlicerERKNS_4MeshE"] = Module["asm"]["F"]).apply(null, arguments)
};
var __ZN4cura14FffGcodeWriter10writeGCodeERNS_16SliceDataStorageERNS_10TimeKeeperE = Module["__ZN4cura14FffGcodeWriter10writeGCodeERNS_16SliceDataStorageERNS_10TimeKeeperE"] = function () {
    return (__ZN4cura14FffGcodeWriter10writeGCodeERNS_16SliceDataStorageERNS_10TimeKeeperE = Module["__ZN4cura14FffGcodeWriter10writeGCodeERNS_16SliceDataStorageERNS_10TimeKeeperE"] = Module["asm"]["G"]).apply(null, arguments)
};
var __ZN4cura14FffGcodeWriter26setConfigFanSpeedLayerTimeEv = Module["__ZN4cura14FffGcodeWriter26setConfigFanSpeedLayerTimeEv"] = function () {
    return (__ZN4cura14FffGcodeWriter26setConfigFanSpeedLayerTimeEv = Module["__ZN4cura14FffGcodeWriter26setConfigFanSpeedLayerTimeEv"] = Module["asm"]["H"]).apply(null, arguments)
};
var __ZN4cura14FffGcodeWriter19setConfigRetractionERNS_16SliceDataStorageE = Module["__ZN4cura14FffGcodeWriter19setConfigRetractionERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura14FffGcodeWriter19setConfigRetractionERNS_16SliceDataStorageE = Module["__ZN4cura14FffGcodeWriter19setConfigRetractionERNS_16SliceDataStorageE"] = Module["asm"]["I"]).apply(null, arguments)
};
var __ZN4cura14FffGcodeWriter19processStartingCodeERKNS_16SliceDataStorageEm = Module["__ZN4cura14FffGcodeWriter19processStartingCodeERKNS_16SliceDataStorageEm"] = function () {
    return (__ZN4cura14FffGcodeWriter19processStartingCodeERKNS_16SliceDataStorageEm = Module["__ZN4cura14FffGcodeWriter19processStartingCodeERKNS_16SliceDataStorageEm"] = Module["asm"]["J"]).apply(null, arguments)
};
var __ZN4cura14FffGcodeWriter24processNextMeshGroupCodeERKNS_16SliceDataStorageE = Module["__ZN4cura14FffGcodeWriter24processNextMeshGroupCodeERKNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura14FffGcodeWriter24processNextMeshGroupCodeERKNS_16SliceDataStorageE = Module["__ZN4cura14FffGcodeWriter24processNextMeshGroupCodeERKNS_16SliceDataStorageE"] = Module["asm"]["K"]).apply(null, arguments)
};
var __ZN4cura14FffGcodeWriter22setInfillAndSkinAnglesERNS_16SliceMeshStorageE = Module["__ZN4cura14FffGcodeWriter22setInfillAndSkinAnglesERNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura14FffGcodeWriter22setInfillAndSkinAnglesERNS_16SliceMeshStorageE = Module["__ZN4cura14FffGcodeWriter22setInfillAndSkinAnglesERNS_16SliceMeshStorageE"] = Module["asm"]["L"]).apply(null, arguments)
};
var __ZN4cura14FffGcodeWriter30calculateExtruderOrderPerLayerERKNS_16SliceDataStorageE = Module["__ZN4cura14FffGcodeWriter30calculateExtruderOrderPerLayerERKNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura14FffGcodeWriter30calculateExtruderOrderPerLayerERKNS_16SliceDataStorageE = Module["__ZN4cura14FffGcodeWriter30calculateExtruderOrderPerLayerERKNS_16SliceDataStorageE"] = Module["asm"]["M"]).apply(null, arguments)
};
var __ZN4cura14FffGcodeWriter26findLayerSeamsForSpiralizeERNS_16SliceDataStorageEm = Module["__ZN4cura14FffGcodeWriter26findLayerSeamsForSpiralizeERNS_16SliceDataStorageEm"] = function () {
    return (__ZN4cura14FffGcodeWriter26findLayerSeamsForSpiralizeERNS_16SliceDataStorageEm = Module["__ZN4cura14FffGcodeWriter26findLayerSeamsForSpiralizeERNS_16SliceDataStorageEm"] = Module["asm"]["N"]).apply(null, arguments)
};
var __ZN4cura14FffGcodeWriter11processRaftERKNS_16SliceDataStorageE = Module["__ZN4cura14FffGcodeWriter11processRaftERKNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura14FffGcodeWriter11processRaftERKNS_16SliceDataStorageE = Module["__ZN4cura14FffGcodeWriter11processRaftERKNS_16SliceDataStorageE"] = Module["asm"]["O"]).apply(null, arguments)
};
var __ZN4cura14FffGcodeWriter30processInitialLayerTemperatureERKNS_16SliceDataStorageEm = Module["__ZN4cura14FffGcodeWriter30processInitialLayerTemperatureERKNS_16SliceDataStorageEm"] = function () {
    return (__ZN4cura14FffGcodeWriter30processInitialLayerTemperatureERKNS_16SliceDataStorageEm = Module["__ZN4cura14FffGcodeWriter30processInitialLayerTemperatureERKNS_16SliceDataStorageEm"] = Module["asm"]["P"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter20setExtruder_addPrimeERKNS_16SliceDataStorageERNS_9LayerPlanEm = Module["__ZNK4cura14FffGcodeWriter20setExtruder_addPrimeERKNS_16SliceDataStorageERNS_9LayerPlanEm"] = function () {
    return (__ZNK4cura14FffGcodeWriter20setExtruder_addPrimeERKNS_16SliceDataStorageERNS_9LayerPlanEm = Module["__ZNK4cura14FffGcodeWriter20setExtruder_addPrimeERKNS_16SliceDataStorageERNS_9LayerPlanEm"] = Module["asm"]["Q"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter16processSkirtBrimERKNS_16SliceDataStorageERNS_9LayerPlanEj = Module["__ZNK4cura14FffGcodeWriter16processSkirtBrimERKNS_16SliceDataStorageERNS_9LayerPlanEj"] = function () {
    return (__ZNK4cura14FffGcodeWriter16processSkirtBrimERKNS_16SliceDataStorageERNS_9LayerPlanEj = Module["__ZNK4cura14FffGcodeWriter16processSkirtBrimERKNS_16SliceDataStorageERNS_9LayerPlanEj"] = Module["asm"]["R"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter13addPrimeTowerERKNS_16SliceDataStorageERNS_9LayerPlanEi = Module["__ZNK4cura14FffGcodeWriter13addPrimeTowerERKNS_16SliceDataStorageERNS_9LayerPlanEi"] = function () {
    return (__ZNK4cura14FffGcodeWriter13addPrimeTowerERKNS_16SliceDataStorageERNS_9LayerPlanEi = Module["__ZNK4cura14FffGcodeWriter13addPrimeTowerERKNS_16SliceDataStorageERNS_9LayerPlanEi"] = Module["asm"]["S"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter17processOozeShieldERKNS_16SliceDataStorageERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter17processOozeShieldERKNS_16SliceDataStorageERNS_9LayerPlanE"] = function () {
    return (__ZNK4cura14FffGcodeWriter17processOozeShieldERKNS_16SliceDataStorageERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter17processOozeShieldERKNS_16SliceDataStorageERNS_9LayerPlanE"] = Module["asm"]["T"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter18processDraftShieldERKNS_16SliceDataStorageERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter18processDraftShieldERKNS_16SliceDataStorageERNS_9LayerPlanE"] = function () {
    return (__ZNK4cura14FffGcodeWriter18processDraftShieldERKNS_16SliceDataStorageERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter18processDraftShieldERKNS_16SliceDataStorageERNS_9LayerPlanE"] = Module["asm"]["U"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter17addSupportToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanEm = Module["__ZNK4cura14FffGcodeWriter17addSupportToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanEm"] = function () {
    return (__ZNK4cura14FffGcodeWriter17addSupportToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanEm = Module["__ZNK4cura14FffGcodeWriter17addSupportToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanEm"] = Module["asm"]["V"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter35addMeshLayerToGCode_meshSurfaceModeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageERKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter35addMeshLayerToGCode_meshSurfaceModeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageERKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE"] = function () {
    return (__ZNK4cura14FffGcodeWriter35addMeshLayerToGCode_meshSurfaceModeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageERKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter35addMeshLayerToGCode_meshSurfaceModeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageERKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE"] = Module["asm"]["W"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter19addMeshLayerToGCodeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter19addMeshLayerToGCodeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE"] = function () {
    return (__ZNK4cura14FffGcodeWriter19addMeshLayerToGCodeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter19addMeshLayerToGCodeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE"] = Module["asm"]["X"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter20processSupportInfillERKNS_16SliceDataStorageERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter20processSupportInfillERKNS_16SliceDataStorageERNS_9LayerPlanE"] = function () {
    return (__ZNK4cura14FffGcodeWriter20processSupportInfillERKNS_16SliceDataStorageERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter20processSupportInfillERKNS_16SliceDataStorageERNS_9LayerPlanE"] = Module["asm"]["Y"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter22addSupportRoofsToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter22addSupportRoofsToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanE"] = function () {
    return (__ZNK4cura14FffGcodeWriter22addSupportRoofsToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter22addSupportRoofsToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanE"] = Module["asm"]["Z"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter24addSupportBottomsToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter24addSupportBottomsToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanE"] = function () {
    return (__ZNK4cura14FffGcodeWriter24addSupportBottomsToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter24addSupportBottomsToGCodeERKNS_16SliceDataStorageERNS_9LayerPlanE"] = Module["asm"]["_"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter27addMeshOpenPolyLinesToGCodeERKNS_16SliceMeshStorageERKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter27addMeshOpenPolyLinesToGCodeERKNS_16SliceMeshStorageERKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE"] = function () {
    return (__ZNK4cura14FffGcodeWriter27addMeshOpenPolyLinesToGCodeERKNS_16SliceMeshStorageERKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter27addMeshOpenPolyLinesToGCodeERKNS_16SliceMeshStorageERKNS_17PathConfigStorage15MeshPathConfigsERNS_9LayerPlanE"] = Module["asm"]["$"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter18addMeshPartToGCodeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter18addMeshPartToGCodeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartERNS_9LayerPlanE"] = function () {
    return (__ZNK4cura14FffGcodeWriter18addMeshPartToGCodeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter18addMeshPartToGCodeERKNS_16SliceDataStorageERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartERNS_9LayerPlanE"] = Module["asm"]["aa"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter14processIroningERKNS_16SliceMeshStorageERKNS_10SliceLayerERKNS_15GCodePathConfigERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter14processIroningERKNS_16SliceMeshStorageERKNS_10SliceLayerERKNS_15GCodePathConfigERNS_9LayerPlanE"] = function () {
    return (__ZNK4cura14FffGcodeWriter14processIroningERKNS_16SliceMeshStorageERKNS_10SliceLayerERKNS_15GCodePathConfigERNS_9LayerPlanE = Module["__ZNK4cura14FffGcodeWriter14processIroningERKNS_16SliceMeshStorageERKNS_10SliceLayerERKNS_15GCodePathConfigERNS_9LayerPlanE"] = Module["asm"]["ba"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter40getExtruderNeedPrimeBlobDuringFirstLayerERKNS_16SliceDataStorageEm = Module["__ZNK4cura14FffGcodeWriter40getExtruderNeedPrimeBlobDuringFirstLayerERKNS_16SliceDataStorageEm"] = function () {
    return (__ZNK4cura14FffGcodeWriter40getExtruderNeedPrimeBlobDuringFirstLayerERKNS_16SliceDataStorageEm = Module["__ZNK4cura14FffGcodeWriter40getExtruderNeedPrimeBlobDuringFirstLayerERKNS_16SliceDataStorageEm"] = Module["asm"]["ca"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter13processInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter13processInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = function () {
    return (__ZNK4cura14FffGcodeWriter13processInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter13processInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = Module["asm"]["da"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter13processInsetsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter13processInsetsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = function () {
    return (__ZNK4cura14FffGcodeWriter13processInsetsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter13processInsetsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = Module["asm"]["ea"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter18processOutlineGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartERb = Module["__ZNK4cura14FffGcodeWriter18processOutlineGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartERb"] = function () {
    return (__ZNK4cura14FffGcodeWriter18processOutlineGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartERb = Module["__ZNK4cura14FffGcodeWriter18processOutlineGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartERb"] = Module["asm"]["fa"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter27processSkinAndPerimeterGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter27processSkinAndPerimeterGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = function () {
    return (__ZNK4cura14FffGcodeWriter27processSkinAndPerimeterGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter27processSkinAndPerimeterGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = Module["asm"]["ga"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter23processMultiLayerInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter23processMultiLayerInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = function () {
    return (__ZNK4cura14FffGcodeWriter23processMultiLayerInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter23processMultiLayerInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = Module["asm"]["ha"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter24processSingleLayerInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter24processSingleLayerInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = function () {
    return (__ZNK4cura14FffGcodeWriter24processSingleLayerInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter24processSingleLayerInfillERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = Module["asm"]["ia"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter17processSkinInsetsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERb = Module["__ZNK4cura14FffGcodeWriter17processSkinInsetsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERb"] = function () {
    return (__ZNK4cura14FffGcodeWriter17processSkinInsetsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERb = Module["__ZNK4cura14FffGcodeWriter17processSkinInsetsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERb"] = Module["asm"]["ja"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter15processSkinPartERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartE = Module["__ZNK4cura14FffGcodeWriter15processSkinPartERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartE"] = function () {
    return (__ZNK4cura14FffGcodeWriter15processSkinPartERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartE = Module["__ZNK4cura14FffGcodeWriter15processSkinPartERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartE"] = Module["asm"]["ka"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter20processPerimeterGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_8PolygonsERKNS_15GCodePathConfigERb = Module["__ZNK4cura14FffGcodeWriter20processPerimeterGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_8PolygonsERKNS_15GCodePathConfigERb"] = function () {
    return (__ZNK4cura14FffGcodeWriter20processPerimeterGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_8PolygonsERKNS_15GCodePathConfigERb = Module["__ZNK4cura14FffGcodeWriter20processPerimeterGapsERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_8PolygonsERKNS_15GCodePathConfigERb"] = Module["asm"]["la"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter21processSpiralizedWallERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter21processSpiralizedWallERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = function () {
    return (__ZNK4cura14FffGcodeWriter21processSpiralizedWallERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZNK4cura14FffGcodeWriter21processSpiralizedWallERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = Module["asm"]["ma"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter14processRoofingERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERNS_8PolygonsERb = Module["__ZNK4cura14FffGcodeWriter14processRoofingERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERNS_8PolygonsERb"] = function () {
    return (__ZNK4cura14FffGcodeWriter14processRoofingERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERNS_8PolygonsERb = Module["__ZNK4cura14FffGcodeWriter14processRoofingERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERNS_8PolygonsERb"] = Module["asm"]["na"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter16processTopBottomERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERNS_8PolygonsERb = Module["__ZNK4cura14FffGcodeWriter16processTopBottomERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERNS_8PolygonsERb"] = function () {
    return (__ZNK4cura14FffGcodeWriter16processTopBottomERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERNS_8PolygonsERb = Module["__ZNK4cura14FffGcodeWriter16processTopBottomERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_8SkinPartERNS_8PolygonsERb"] = Module["asm"]["oa"]).apply(null, arguments)
};
var __ZNK4cura14FffGcodeWriter23processSkinPrintFeatureERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_8PolygonsERKNS_15GCodePathConfigENS_11EFillMethodENS_12AngleDegreesExNS_5RatioEPS9_Rbd = Module["__ZNK4cura14FffGcodeWriter23processSkinPrintFeatureERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_8PolygonsERKNS_15GCodePathConfigENS_11EFillMethodENS_12AngleDegreesExNS_5RatioEPS9_Rbd"] = function () {
    return (__ZNK4cura14FffGcodeWriter23processSkinPrintFeatureERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_8PolygonsERKNS_15GCodePathConfigENS_11EFillMethodENS_12AngleDegreesExNS_5RatioEPS9_Rbd = Module["__ZNK4cura14FffGcodeWriter23processSkinPrintFeatureERKNS_16SliceDataStorageERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_8PolygonsERKNS_15GCodePathConfigENS_11EFillMethodENS_12AngleDegreesExNS_5RatioEPS9_Rbd"] = Module["asm"]["pa"]).apply(null, arguments)
};
var __ZN4cura14FffGcodeWriter8finalizeEv = Module["__ZN4cura14FffGcodeWriter8finalizeEv"] = function () {
    return (__ZN4cura14FffGcodeWriter8finalizeEv = Module["__ZN4cura14FffGcodeWriter8finalizeEv"] = Module["asm"]["qa"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator13generateAreasERNS_16SliceDataStorageEPNS_9MeshGroupERNS_10TimeKeeperE = Module["__ZN4cura19FffPolygonGenerator13generateAreasERNS_16SliceDataStorageEPNS_9MeshGroupERNS_10TimeKeeperE"] = function () {
    return (__ZN4cura19FffPolygonGenerator13generateAreasERNS_16SliceDataStorageEPNS_9MeshGroupERNS_10TimeKeeperE = Module["__ZN4cura19FffPolygonGenerator13generateAreasERNS_16SliceDataStorageEPNS_9MeshGroupERNS_10TimeKeeperE"] = Module["asm"]["ra"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator10sliceModelEPNS_9MeshGroupERNS_10TimeKeeperERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator10sliceModelEPNS_9MeshGroupERNS_10TimeKeeperERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura19FffPolygonGenerator10sliceModelEPNS_9MeshGroupERNS_10TimeKeeperERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator10sliceModelEPNS_9MeshGroupERNS_10TimeKeeperERNS_16SliceDataStorageE"] = Module["asm"]["sa"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator15slices2polygonsERNS_16SliceDataStorageERNS_10TimeKeeperE = Module["__ZN4cura19FffPolygonGenerator15slices2polygonsERNS_16SliceDataStorageERNS_10TimeKeeperE"] = function () {
    return (__ZN4cura19FffPolygonGenerator15slices2polygonsERNS_16SliceDataStorageERNS_10TimeKeeperE = Module["__ZN4cura19FffPolygonGenerator15slices2polygonsERNS_16SliceDataStorageERNS_10TimeKeeperE"] = Module["asm"]["ta"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator27processBasicWallsSkinInfillERNS_16SliceDataStorageEmRKNSt3__26vectorImNS3_9allocatorImEEEERNS_22ProgressStageEstimatorE = Module["__ZN4cura19FffPolygonGenerator27processBasicWallsSkinInfillERNS_16SliceDataStorageEmRKNSt3__26vectorImNS3_9allocatorImEEEERNS_22ProgressStageEstimatorE"] = function () {
    return (__ZN4cura19FffPolygonGenerator27processBasicWallsSkinInfillERNS_16SliceDataStorageEmRKNSt3__26vectorImNS3_9allocatorImEEEERNS_22ProgressStageEstimatorE = Module["__ZN4cura19FffPolygonGenerator27processBasicWallsSkinInfillERNS_16SliceDataStorageEmRKNSt3__26vectorImNS3_9allocatorImEEEERNS_22ProgressStageEstimatorE"] = Module["asm"]["ua"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator12isEmptyLayerERNS_16SliceDataStorageEj = Module["__ZN4cura19FffPolygonGenerator12isEmptyLayerERNS_16SliceDataStorageEj"] = function () {
    return (__ZN4cura19FffPolygonGenerator12isEmptyLayerERNS_16SliceDataStorageEj = Module["__ZN4cura19FffPolygonGenerator12isEmptyLayerERNS_16SliceDataStorageEj"] = Module["asm"]["va"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator22removeEmptyFirstLayersERNS_16SliceDataStorageERm = Module["__ZN4cura19FffPolygonGenerator22removeEmptyFirstLayersERNS_16SliceDataStorageERm"] = function () {
    return (__ZN4cura19FffPolygonGenerator22removeEmptyFirstLayersERNS_16SliceDataStorageERm = Module["__ZN4cura19FffPolygonGenerator22removeEmptyFirstLayersERNS_16SliceDataStorageERm"] = Module["asm"]["wa"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator28computePrintHeightStatisticsERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator28computePrintHeightStatisticsERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura19FffPolygonGenerator28computePrintHeightStatisticsERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator28computePrintHeightStatisticsERNS_16SliceDataStorageE"] = Module["asm"]["xa"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator17processOozeShieldERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator17processOozeShieldERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura19FffPolygonGenerator17processOozeShieldERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator17processOozeShieldERNS_16SliceDataStorageE"] = Module["asm"]["ya"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator18processDraftShieldERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator18processDraftShieldERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura19FffPolygonGenerator18processDraftShieldERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator18processDraftShieldERNS_16SliceDataStorageE"] = Module["asm"]["za"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator23processPlatformAdhesionERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator23processPlatformAdhesionERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura19FffPolygonGenerator23processPlatformAdhesionERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator23processPlatformAdhesionERNS_16SliceDataStorageE"] = Module["asm"]["Aa"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator18processOutlineGapsERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator18processOutlineGapsERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura19FffPolygonGenerator18processOutlineGapsERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator18processOutlineGapsERNS_16SliceDataStorageE"] = Module["asm"]["Ba"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator20processPerimeterGapsERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator20processPerimeterGapsERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura19FffPolygonGenerator20processPerimeterGapsERNS_16SliceDataStorageE = Module["__ZN4cura19FffPolygonGenerator20processPerimeterGapsERNS_16SliceDataStorageE"] = Module["asm"]["Ca"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator29processDerivedWallsSkinInfillERNS_16SliceMeshStorageE = Module["__ZN4cura19FffPolygonGenerator29processDerivedWallsSkinInfillERNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura19FffPolygonGenerator29processDerivedWallsSkinInfillERNS_16SliceMeshStorageE = Module["__ZN4cura19FffPolygonGenerator29processDerivedWallsSkinInfillERNS_16SliceMeshStorageE"] = Module["asm"]["Da"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator17processInfillMeshERNS_16SliceDataStorageEmRKNSt3__26vectorImNS3_9allocatorImEEEE = Module["__ZN4cura19FffPolygonGenerator17processInfillMeshERNS_16SliceDataStorageEmRKNSt3__26vectorImNS3_9allocatorImEEEE"] = function () {
    return (__ZN4cura19FffPolygonGenerator17processInfillMeshERNS_16SliceDataStorageEmRKNSt3__26vectorImNS3_9allocatorImEEEE = Module["__ZN4cura19FffPolygonGenerator17processInfillMeshERNS_16SliceDataStorageEmRKNSt3__26vectorImNS3_9allocatorImEEEE"] = Module["asm"]["Ea"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator13processInsetsERNS_16SliceMeshStorageEm = Module["__ZN4cura19FffPolygonGenerator13processInsetsERNS_16SliceMeshStorageEm"] = function () {
    return (__ZN4cura19FffPolygonGenerator13processInsetsERNS_16SliceMeshStorageEm = Module["__ZN4cura19FffPolygonGenerator13processInsetsERNS_16SliceMeshStorageEm"] = Module["asm"]["Fa"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator21processSkinsAndInfillERNS_16SliceMeshStorageENS_10LayerIndexEb = Module["__ZN4cura19FffPolygonGenerator21processSkinsAndInfillERNS_16SliceMeshStorageENS_10LayerIndexEb"] = function () {
    return (__ZN4cura19FffPolygonGenerator21processSkinsAndInfillERNS_16SliceMeshStorageENS_10LayerIndexEb = Module["__ZN4cura19FffPolygonGenerator21processSkinsAndInfillERNS_16SliceMeshStorageENS_10LayerIndexEb"] = Module["asm"]["Ga"]).apply(null, arguments)
};
var __ZN4cura19FffPolygonGenerator17processFuzzyWallsERNS_16SliceMeshStorageE = Module["__ZN4cura19FffPolygonGenerator17processFuzzyWallsERNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura19FffPolygonGenerator17processFuzzyWallsERNS_16SliceMeshStorageE = Module["__ZN4cura19FffPolygonGenerator17processFuzzyWallsERNS_16SliceMeshStorageE"] = Module["asm"]["Ha"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport9setFlavorENS_12EGCodeFlavorE = Module["__ZN4cura11GCodeExport9setFlavorENS_12EGCodeFlavorE"] = function () {
    return (__ZN4cura11GCodeExport9setFlavorENS_12EGCodeFlavorE = Module["__ZN4cura11GCodeExport9setFlavorENS_12EGCodeFlavorE"] = Module["asm"]["Ia"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport8preSetupEm = Module["__ZN4cura11GCodeExport8preSetupEm"] = function () {
    return (__ZN4cura11GCodeExport8preSetupEm = Module["__ZN4cura11GCodeExport8preSetupEm"] = Module["asm"]["Ja"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport19setFilamentDiameterEmx = Module["__ZN4cura11GCodeExport19setFilamentDiameterEmx"] = function () {
    return (__ZN4cura11GCodeExport19setFilamentDiameterEmx = Module["__ZN4cura11GCodeExport19setFilamentDiameterEmx"] = Module["asm"]["Ka"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport15setInitialTempsEj = Module["__ZN4cura11GCodeExport15setInitialTempsEj"] = function () {
    return (__ZN4cura11GCodeExport15setInitialTempsEj = Module["__ZN4cura11GCodeExport15setInitialTempsEj"] = Module["asm"]["La"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport14setInitialTempEid = Module["__ZN4cura11GCodeExport14setInitialTempEid"] = function () {
    return (__ZN4cura11GCodeExport14setInitialTempEid = Module["__ZN4cura11GCodeExport14setInitialTempEid"] = Module["asm"]["Ma"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport10setLayerNrEj = Module["__ZN4cura11GCodeExport10setLayerNrEj"] = function () {
    return (__ZN4cura11GCodeExport10setLayerNrEj = Module["__ZN4cura11GCodeExport10setLayerNrEj"] = Module["asm"]["Na"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport15setOutputStreamEPNSt3__213basic_ostreamIcNS1_11char_traitsIcEEEE = Module["__ZN4cura11GCodeExport15setOutputStreamEPNSt3__213basic_ostreamIcNS1_11char_traitsIcEEEE"] = function () {
    return (__ZN4cura11GCodeExport15setOutputStreamEPNSt3__213basic_ostreamIcNS1_11char_traitsIcEEEE = Module["__ZN4cura11GCodeExport15setOutputStreamEPNSt3__213basic_ostreamIcNS1_11char_traitsIcEEEE"] = Module["asm"]["Oa"]).apply(null, arguments)
};
var __ZNK4cura11GCodeExport17getExtruderIsUsedEi = Module["__ZNK4cura11GCodeExport17getExtruderIsUsedEi"] = function () {
    return (__ZNK4cura11GCodeExport17getExtruderIsUsedEi = Module["__ZNK4cura11GCodeExport17getExtruderIsUsedEi"] = Module["asm"]["Pa"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport4setZEi = Module["__ZN4cura11GCodeExport4setZEi"] = function () {
    return (__ZN4cura11GCodeExport4setZEi = Module["__ZN4cura11GCodeExport4setZEi"] = Module["asm"]["Qa"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport28setFlowRateExtrusionSettingsEdd = Module["__ZN4cura11GCodeExport28setFlowRateExtrusionSettingsEdd"] = function () {
    return (__ZN4cura11GCodeExport28setFlowRateExtrusionSettingsEdd = Module["__ZN4cura11GCodeExport28setFlowRateExtrusionSettingsEdd"] = Module["asm"]["Ra"]).apply(null, arguments)
};
var __ZNK4cura11GCodeExport12getPositionZEv = Module["__ZNK4cura11GCodeExport12getPositionZEv"] = function () {
    return (__ZNK4cura11GCodeExport12getPositionZEv = Module["__ZNK4cura11GCodeExport12getPositionZEv"] = Module["asm"]["Sa"]).apply(null, arguments)
};
var __ZNK4cura11GCodeExport13getExtruderNrEv = Module["__ZNK4cura11GCodeExport13getExtruderNrEv"] = function () {
    return (__ZNK4cura11GCodeExport13getExtruderNrEv = Module["__ZNK4cura11GCodeExport13getExtruderNrEv"] = Module["asm"]["Ta"]).apply(null, arguments)
};
var __ZNK4cura11GCodeExport24getCurrentExtrudedVolumeEv = Module["__ZNK4cura11GCodeExport24getCurrentExtrudedVolumeEv"] = function () {
    return (__ZNK4cura11GCodeExport24getCurrentExtrudedVolumeEv = Module["__ZNK4cura11GCodeExport24getCurrentExtrudedVolumeEv"] = Module["asm"]["Ua"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport5eToMmEd = Module["__ZN4cura11GCodeExport5eToMmEd"] = function () {
    return (__ZN4cura11GCodeExport5eToMmEd = Module["__ZN4cura11GCodeExport5eToMmEd"] = Module["asm"]["Va"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport6mm3ToEEd = Module["__ZN4cura11GCodeExport6mm3ToEEd"] = function () {
    return (__ZN4cura11GCodeExport6mm3ToEEd = Module["__ZN4cura11GCodeExport6mm3ToEEd"] = Module["asm"]["Wa"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport5mmToEEd = Module["__ZN4cura11GCodeExport5mmToEEd"] = function () {
    return (__ZN4cura11GCodeExport5mmToEEd = Module["__ZN4cura11GCodeExport5mmToEEd"] = Module["asm"]["Xa"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport20getTotalFilamentUsedEm = Module["__ZN4cura11GCodeExport20getTotalFilamentUsedEm"] = function () {
    return (__ZN4cura11GCodeExport20getTotalFilamentUsedEm = Module["__ZN4cura11GCodeExport20getTotalFilamentUsedEm"] = Module["asm"]["Ya"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport21getSumTotalPrintTimesEv = Module["__ZN4cura11GCodeExport21getSumTotalPrintTimesEv"] = function () {
    return (__ZN4cura11GCodeExport21getSumTotalPrintTimesEv = Module["__ZN4cura11GCodeExport21getSumTotalPrintTimesEv"] = Module["asm"]["Za"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport30resetTotalPrintTimeAndFilamentEv = Module["__ZN4cura11GCodeExport30resetTotalPrintTimeAndFilamentEv"] = function () {
    return (__ZN4cura11GCodeExport30resetTotalPrintTimeAndFilamentEv = Module["__ZN4cura11GCodeExport30resetTotalPrintTimeAndFilamentEv"] = Module["asm"]["_a"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport20updateTotalPrintTimeEv = Module["__ZN4cura11GCodeExport20updateTotalPrintTimeEv"] = function () {
    return (__ZN4cura11GCodeExport20updateTotalPrintTimeEv = Module["__ZN4cura11GCodeExport20updateTotalPrintTimeEv"] = Module["asm"]["$a"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport16writeTimeCommentEd = Module["__ZN4cura11GCodeExport16writeTimeCommentEd"] = function () {
    return (__ZN4cura11GCodeExport16writeTimeCommentEd = Module["__ZN4cura11GCodeExport16writeTimeCommentEd"] = Module["asm"]["ab"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport12writeCommentERKNSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE = Module["__ZN4cura11GCodeExport12writeCommentERKNSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE"] = function () {
    return (__ZN4cura11GCodeExport12writeCommentERKNSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE = Module["__ZN4cura11GCodeExport12writeCommentERKNSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE"] = Module["asm"]["bb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport16writeTypeCommentERKNS_16PrintFeatureTypeE = Module["__ZN4cura11GCodeExport16writeTypeCommentERKNS_16PrintFeatureTypeE"] = function () {
    return (__ZN4cura11GCodeExport16writeTypeCommentERKNS_16PrintFeatureTypeE = Module["__ZN4cura11GCodeExport16writeTypeCommentERKNS_16PrintFeatureTypeE"] = Module["asm"]["cb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport17writeLayerCommentEi = Module["__ZN4cura11GCodeExport17writeLayerCommentEi"] = function () {
    return (__ZN4cura11GCodeExport17writeLayerCommentEi = Module["__ZN4cura11GCodeExport17writeLayerCommentEi"] = Module["asm"]["db"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport22writeLayerCountCommentEi = Module["__ZN4cura11GCodeExport22writeLayerCountCommentEi"] = function () {
    return (__ZN4cura11GCodeExport22writeLayerCountCommentEi = Module["__ZN4cura11GCodeExport22writeLayerCountCommentEi"] = Module["asm"]["eb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport9writeLineEPKc = Module["__ZN4cura11GCodeExport9writeLineEPKc"] = function () {
    return (__ZN4cura11GCodeExport9writeLineEPKc = Module["__ZN4cura11GCodeExport9writeLineEPKc"] = Module["asm"]["fb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport18writeExtrusionModeEb = Module["__ZN4cura11GCodeExport18writeExtrusionModeEb"] = function () {
    return (__ZN4cura11GCodeExport18writeExtrusionModeEb = Module["__ZN4cura11GCodeExport18writeExtrusionModeEb"] = Module["asm"]["gb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport19resetExtrusionValueEv = Module["__ZN4cura11GCodeExport19resetExtrusionValueEv"] = function () {
    return (__ZN4cura11GCodeExport19resetExtrusionValueEv = Module["__ZN4cura11GCodeExport19resetExtrusionValueEv"] = Module["asm"]["hb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport10writeDelayERKNS_8DurationE = Module["__ZN4cura11GCodeExport10writeDelayERKNS_8DurationE"] = function () {
    return (__ZN4cura11GCodeExport10writeDelayERKNS_8DurationE = Module["__ZN4cura11GCodeExport10writeDelayERKNS_8DurationE"] = Module["asm"]["ib"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport11writeTravelERKN10ClipperLib8IntPointERKNS_8VelocityE = Module["__ZN4cura11GCodeExport11writeTravelERKN10ClipperLib8IntPointERKNS_8VelocityE"] = function () {
    return (__ZN4cura11GCodeExport11writeTravelERKN10ClipperLib8IntPointERKNS_8VelocityE = Module["__ZN4cura11GCodeExport11writeTravelERKN10ClipperLib8IntPointERKNS_8VelocityE"] = Module["asm"]["jb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport12writeMoveBFBEiiiRKNS_8VelocityEdNS_16PrintFeatureTypeE = Module["__ZN4cura11GCodeExport12writeMoveBFBEiiiRKNS_8VelocityEdNS_16PrintFeatureTypeE"] = function () {
    return (__ZN4cura11GCodeExport12writeMoveBFBEiiiRKNS_8VelocityEdNS_16PrintFeatureTypeE = Module["__ZN4cura11GCodeExport12writeMoveBFBEiiiRKNS_8VelocityEdNS_16PrintFeatureTypeE"] = Module["asm"]["kb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport11writeTravelERKxS2_S2_RKNS_8VelocityE = Module["__ZN4cura11GCodeExport11writeTravelERKxS2_S2_RKNS_8VelocityE"] = function () {
    return (__ZN4cura11GCodeExport11writeTravelERKxS2_S2_RKNS_8VelocityE = Module["__ZN4cura11GCodeExport11writeTravelERKxS2_S2_RKNS_8VelocityE"] = Module["asm"]["lb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport11writeTravelERKNS_6Point3ERKNS_8VelocityE = Module["__ZN4cura11GCodeExport11writeTravelERKNS_6Point3ERKNS_8VelocityE"] = function () {
    return (__ZN4cura11GCodeExport11writeTravelERKNS_6Point3ERKNS_8VelocityE = Module["__ZN4cura11GCodeExport11writeTravelERKNS_6Point3ERKNS_8VelocityE"] = Module["asm"]["mb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport14writeExtrusionERKN10ClipperLib8IntPointERKNS_8VelocityEdNS_16PrintFeatureTypeEb = Module["__ZN4cura11GCodeExport14writeExtrusionERKN10ClipperLib8IntPointERKNS_8VelocityEdNS_16PrintFeatureTypeEb"] = function () {
    return (__ZN4cura11GCodeExport14writeExtrusionERKN10ClipperLib8IntPointERKNS_8VelocityEdNS_16PrintFeatureTypeEb = Module["__ZN4cura11GCodeExport14writeExtrusionERKN10ClipperLib8IntPointERKNS_8VelocityEdNS_16PrintFeatureTypeEb"] = Module["asm"]["nb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport14writeExtrusionEiiiRKNS_8VelocityEdRKNS_16PrintFeatureTypeEb = Module["__ZN4cura11GCodeExport14writeExtrusionEiiiRKNS_8VelocityEdRKNS_16PrintFeatureTypeEb"] = function () {
    return (__ZN4cura11GCodeExport14writeExtrusionEiiiRKNS_8VelocityEdRKNS_16PrintFeatureTypeEb = Module["__ZN4cura11GCodeExport14writeExtrusionEiiiRKNS_8VelocityEdRKNS_16PrintFeatureTypeEb"] = Module["asm"]["ob"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport14writeExtrusionERKNS_6Point3ERKNS_8VelocityEdNS_16PrintFeatureTypeEb = Module["__ZN4cura11GCodeExport14writeExtrusionERKNS_6Point3ERKNS_8VelocityEdNS_16PrintFeatureTypeEb"] = function () {
    return (__ZN4cura11GCodeExport14writeExtrusionERKNS_6Point3ERKNS_8VelocityEdNS_16PrintFeatureTypeEb = Module["__ZN4cura11GCodeExport14writeExtrusionERKNS_6Point3ERKNS_8VelocityEdNS_16PrintFeatureTypeEb"] = Module["asm"]["pb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport10writeFXYZEERKNS_8VelocityEiiidRKNS_16PrintFeatureTypeE = Module["__ZN4cura11GCodeExport10writeFXYZEERKNS_8VelocityEiiidRKNS_16PrintFeatureTypeE"] = function () {
    return (__ZN4cura11GCodeExport10writeFXYZEERKNS_8VelocityEiiidRKNS_16PrintFeatureTypeE = Module["__ZN4cura11GCodeExport10writeFXYZEERKNS_8VelocityEiiidRKNS_16PrintFeatureTypeE"] = Module["asm"]["qb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport12writeZhopEndEv = Module["__ZN4cura11GCodeExport12writeZhopEndEv"] = function () {
    return (__ZN4cura11GCodeExport12writeZhopEndEv = Module["__ZN4cura11GCodeExport12writeZhopEndEv"] = Module["asm"]["rb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport25writeUnretractionAndPrimeEv = Module["__ZN4cura11GCodeExport25writeUnretractionAndPrimeEv"] = function () {
    return (__ZN4cura11GCodeExport25writeUnretractionAndPrimeEv = Module["__ZN4cura11GCodeExport25writeUnretractionAndPrimeEv"] = Module["asm"]["sb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport15writeRetractionERKNS_16RetractionConfigEbb = Module["__ZN4cura11GCodeExport15writeRetractionERKNS_16RetractionConfigEbb"] = function () {
    return (__ZN4cura11GCodeExport15writeRetractionERKNS_16RetractionConfigEbb = Module["__ZN4cura11GCodeExport15writeRetractionERKNS_16RetractionConfigEbb"] = Module["asm"]["tb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport14writeZhopStartEx = Module["__ZN4cura11GCodeExport14writeZhopStartEx"] = function () {
    return (__ZN4cura11GCodeExport14writeZhopStartEx = Module["__ZN4cura11GCodeExport14writeZhopStartEx"] = Module["asm"]["ub"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport13startExtruderEm = Module["__ZN4cura11GCodeExport13startExtruderEm"] = function () {
    return (__ZN4cura11GCodeExport13startExtruderEm = Module["__ZN4cura11GCodeExport13startExtruderEm"] = Module["asm"]["vb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport9writeCodeEPKc = Module["__ZN4cura11GCodeExport9writeCodeEPKc"] = function () {
    return (__ZN4cura11GCodeExport9writeCodeEPKc = Module["__ZN4cura11GCodeExport9writeCodeEPKc"] = Module["asm"]["wb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport20setExtruderFanNumberEi = Module["__ZN4cura11GCodeExport20setExtruderFanNumberEi"] = function () {
    return (__ZN4cura11GCodeExport20setExtruderFanNumberEi = Module["__ZN4cura11GCodeExport20setExtruderFanNumberEi"] = Module["asm"]["xb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport14switchExtruderEmRKNS_16RetractionConfigE = Module["__ZN4cura11GCodeExport14switchExtruderEmRKNS_16RetractionConfigE"] = function () {
    return (__ZN4cura11GCodeExport14switchExtruderEmRKNS_16RetractionConfigE = Module["__ZN4cura11GCodeExport14switchExtruderEmRKNS_16RetractionConfigE"] = Module["asm"]["yb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport15writePrimeTrainERKNS_8VelocityE = Module["__ZN4cura11GCodeExport15writePrimeTrainERKNS_8VelocityE"] = function () {
    return (__ZN4cura11GCodeExport15writePrimeTrainERKNS_8VelocityE = Module["__ZN4cura11GCodeExport15writePrimeTrainERKNS_8VelocityE"] = Module["asm"]["zb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport15writeFanCommandEd = Module["__ZN4cura11GCodeExport15writeFanCommandEd"] = function () {
    return (__ZN4cura11GCodeExport15writeFanCommandEd = Module["__ZN4cura11GCodeExport15writeFanCommandEd"] = Module["asm"]["Ab"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport23writeTemperatureCommandEmRKNS_11TemperatureEb = Module["__ZN4cura11GCodeExport23writeTemperatureCommandEmRKNS_11TemperatureEb"] = function () {
    return (__ZN4cura11GCodeExport23writeTemperatureCommandEmRKNS_11TemperatureEb = Module["__ZN4cura11GCodeExport23writeTemperatureCommandEmRKNS_11TemperatureEb"] = Module["asm"]["Bb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport26writeBedTemperatureCommandERKNS_11TemperatureEb = Module["__ZN4cura11GCodeExport26writeBedTemperatureCommandERKNS_11TemperatureEb"] = function () {
    return (__ZN4cura11GCodeExport26writeBedTemperatureCommandERKNS_11TemperatureEb = Module["__ZN4cura11GCodeExport26writeBedTemperatureCommandERKNS_11TemperatureEb"] = Module["asm"]["Cb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport22writePrintAccelerationERKNS_8VelocityE = Module["__ZN4cura11GCodeExport22writePrintAccelerationERKNS_8VelocityE"] = function () {
    return (__ZN4cura11GCodeExport22writePrintAccelerationERKNS_8VelocityE = Module["__ZN4cura11GCodeExport22writePrintAccelerationERKNS_8VelocityE"] = Module["asm"]["Db"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport23writeTravelAccelerationERKNS_8VelocityE = Module["__ZN4cura11GCodeExport23writeTravelAccelerationERKNS_8VelocityE"] = function () {
    return (__ZN4cura11GCodeExport23writeTravelAccelerationERKNS_8VelocityE = Module["__ZN4cura11GCodeExport23writeTravelAccelerationERKNS_8VelocityE"] = Module["asm"]["Eb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport9writeJerkERKNS_8VelocityE = Module["__ZN4cura11GCodeExport9writeJerkERKNS_8VelocityE"] = function () {
    return (__ZN4cura11GCodeExport9writeJerkERKNS_8VelocityE = Module["__ZN4cura11GCodeExport9writeJerkERKNS_8VelocityE"] = Module["asm"]["Fb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport17writeMaxZFeedrateERKNS_8VelocityE = Module["__ZN4cura11GCodeExport17writeMaxZFeedrateERKNS_8VelocityE"] = function () {
    return (__ZN4cura11GCodeExport17writeMaxZFeedrateERKNS_8VelocityE = Module["__ZN4cura11GCodeExport17writeMaxZFeedrateERKNS_8VelocityE"] = Module["asm"]["Gb"]).apply(null, arguments)
};
var __ZN4cura11GCodeExport8finalizeEPKc = Module["__ZN4cura11GCodeExport8finalizeEPKc"] = function () {
    return (__ZN4cura11GCodeExport8finalizeEPKc = Module["__ZN4cura11GCodeExport8finalizeEPKc"] = Module["asm"]["Hb"]).apply(null, arguments)
};
var __ZNK4cura15GCodePathConfig18calculateExtrusionEv = Module["__ZNK4cura15GCodePathConfig18calculateExtrusionEv"] = function () {
    return (__ZNK4cura15GCodePathConfig18calculateExtrusionEv = Module["__ZNK4cura15GCodePathConfig18calculateExtrusionEv"] = Module["asm"]["Ib"]).apply(null, arguments)
};
var __ZN4cura15GCodePathConfig11smoothSpeedENS0_16SpeedDerivativesERKNS_10LayerIndexES4_ = Module["__ZN4cura15GCodePathConfig11smoothSpeedENS0_16SpeedDerivativesERKNS_10LayerIndexES4_"] = function () {
    return (__ZN4cura15GCodePathConfig11smoothSpeedENS0_16SpeedDerivativesERKNS_10LayerIndexES4_ = Module["__ZN4cura15GCodePathConfig11smoothSpeedENS0_16SpeedDerivativesERKNS_10LayerIndexES4_"] = Module["asm"]["Jb"]).apply(null, arguments)
};
var __ZNK4cura15GCodePathConfig20getExtrusionMM3perMMEv = Module["__ZNK4cura15GCodePathConfig20getExtrusionMM3perMMEv"] = function () {
    return (__ZNK4cura15GCodePathConfig20getExtrusionMM3perMMEv = Module["__ZNK4cura15GCodePathConfig20getExtrusionMM3perMMEv"] = Module["asm"]["Kb"]).apply(null, arguments)
};
var __ZNK4cura15GCodePathConfig12isTravelPathEv = Module["__ZNK4cura15GCodePathConfig12isTravelPathEv"] = function () {
    return (__ZNK4cura15GCodePathConfig12isTravelPathEv = Module["__ZNK4cura15GCodePathConfig12isTravelPathEv"] = Module["asm"]["Lb"]).apply(null, arguments)
};
var __ZNK4cura15GCodePathConfig12isBridgePathEv = Module["__ZNK4cura15GCodePathConfig12isBridgePathEv"] = function () {
    return (__ZNK4cura15GCodePathConfig12isBridgePathEv = Module["__ZNK4cura15GCodePathConfig12isBridgePathEv"] = Module["asm"]["Mb"]).apply(null, arguments)
};
var __ZNK4cura15GCodePathConfig11getFanSpeedEv = Module["__ZNK4cura15GCodePathConfig11getFanSpeedEv"] = function () {
    return (__ZNK4cura15GCodePathConfig11getFanSpeedEv = Module["__ZNK4cura15GCodePathConfig11getFanSpeedEv"] = Module["asm"]["Nb"]).apply(null, arguments)
};
var __ZN4cura6Infill8generateERNS_8PolygonsES2_PKNS_22SierpinskiFillProviderEPKNS_16SliceMeshStorageE = Module["__ZN4cura6Infill8generateERNS_8PolygonsES2_PKNS_22SierpinskiFillProviderEPKNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura6Infill8generateERNS_8PolygonsES2_PKNS_22SierpinskiFillProviderEPKNS_16SliceMeshStorageE = Module["__ZN4cura6Infill8generateERNS_8PolygonsES2_PKNS_22SierpinskiFillProviderEPKNS_16SliceMeshStorageE"] = Module["asm"]["Ob"]).apply(null, arguments)
};
var __ZN4cura6Infill9_generateERNS_8PolygonsES2_PKNS_22SierpinskiFillProviderEPKNS_16SliceMeshStorageE = Module["__ZN4cura6Infill9_generateERNS_8PolygonsES2_PKNS_22SierpinskiFillProviderEPKNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura6Infill9_generateERNS_8PolygonsES2_PKNS_22SierpinskiFillProviderEPKNS_16SliceMeshStorageE = Module["__ZN4cura6Infill9_generateERNS_8PolygonsES2_PKNS_22SierpinskiFillProviderEPKNS_16SliceMeshStorageE"] = Module["asm"]["Pb"]).apply(null, arguments)
};
var __ZN4cura6Infill14multiplyInfillERNS_8PolygonsES2_ = Module["__ZN4cura6Infill14multiplyInfillERNS_8PolygonsES2_"] = function () {
    return (__ZN4cura6Infill14multiplyInfillERNS_8PolygonsES2_ = Module["__ZN4cura6Infill14multiplyInfillERNS_8PolygonsES2_"] = Module["asm"]["Qb"]).apply(null, arguments)
};
var __ZN4cura6Infill18generateLineInfillERNS_8PolygonsEiRKdx = Module["__ZN4cura6Infill18generateLineInfillERNS_8PolygonsEiRKdx"] = function () {
    return (__ZN4cura6Infill18generateLineInfillERNS_8PolygonsEiRKdx = Module["__ZN4cura6Infill18generateLineInfillERNS_8PolygonsEiRKdx"] = Module["asm"]["Rb"]).apply(null, arguments)
};
var __ZN4cura6Infill25generateTetrahedralInfillERNS_8PolygonsE = Module["__ZN4cura6Infill25generateTetrahedralInfillERNS_8PolygonsE"] = function () {
    return (__ZN4cura6Infill25generateTetrahedralInfillERNS_8PolygonsE = Module["__ZN4cura6Infill25generateTetrahedralInfillERNS_8PolygonsE"] = Module["asm"]["Sb"]).apply(null, arguments)
};
var __ZN4cura6Infill26generateQuarterCubicInfillERNS_8PolygonsE = Module["__ZN4cura6Infill26generateQuarterCubicInfillERNS_8PolygonsE"] = function () {
    return (__ZN4cura6Infill26generateQuarterCubicInfillERNS_8PolygonsE = Module["__ZN4cura6Infill26generateQuarterCubicInfillERNS_8PolygonsE"] = Module["asm"]["Tb"]).apply(null, arguments)
};
var __ZN4cura6Infill24generateConcentricInfillERNS_8PolygonsEi = Module["__ZN4cura6Infill24generateConcentricInfillERNS_8PolygonsEi"] = function () {
    return (__ZN4cura6Infill24generateConcentricInfillERNS_8PolygonsEi = Module["__ZN4cura6Infill24generateConcentricInfillERNS_8PolygonsEi"] = Module["asm"]["Ub"]).apply(null, arguments)
};
var __ZN4cura6Infill20generateZigZagInfillERNS_8PolygonsExRKd = Module["__ZN4cura6Infill20generateZigZagInfillERNS_8PolygonsExRKd"] = function () {
    return (__ZN4cura6Infill20generateZigZagInfillERNS_8PolygonsExRKd = Module["__ZN4cura6Infill20generateZigZagInfillERNS_8PolygonsExRKd"] = Module["asm"]["Vb"]).apply(null, arguments)
};
var __ZN4cura6Infill25generateCubicSubDivInfillERNS_8PolygonsERKNS_16SliceMeshStorageE = Module["__ZN4cura6Infill25generateCubicSubDivInfillERNS_8PolygonsERKNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura6Infill25generateCubicSubDivInfillERNS_8PolygonsERKNS_16SliceMeshStorageE = Module["__ZN4cura6Infill25generateCubicSubDivInfillERNS_8PolygonsERKNS_16SliceMeshStorageE"] = Module["asm"]["Wb"]).apply(null, arguments)
};
var __ZN4cura6Infill19generateCrossInfillERKNS_22SierpinskiFillProviderERNS_8PolygonsES5_ = Module["__ZN4cura6Infill19generateCrossInfillERKNS_22SierpinskiFillProviderERNS_8PolygonsES5_"] = function () {
    return (__ZN4cura6Infill19generateCrossInfillERKNS_22SierpinskiFillProviderERNS_8PolygonsES5_ = Module["__ZN4cura6Infill19generateCrossInfillERKNS_22SierpinskiFillProviderERNS_8PolygonsES5_"] = Module["asm"]["Xb"]).apply(null, arguments)
};
var __ZN4cura6Infill12connectLinesERNS_8PolygonsE = Module["__ZN4cura6Infill12connectLinesERNS_8PolygonsE"] = function () {
    return (__ZN4cura6Infill12connectLinesERNS_8PolygonsE = Module["__ZN4cura6Infill12connectLinesERNS_8PolygonsE"] = Module["asm"]["Yb"]).apply(null, arguments)
};
var __ZN4cura6Infill18generateGridInfillERNS_8PolygonsE = Module["__ZN4cura6Infill18generateGridInfillERNS_8PolygonsE"] = function () {
    return (__ZN4cura6Infill18generateGridInfillERNS_8PolygonsE = Module["__ZN4cura6Infill18generateGridInfillERNS_8PolygonsE"] = Module["asm"]["Zb"]).apply(null, arguments)
};
var __ZN4cura6Infill25generateLinearBasedInfillEiRNS_8PolygonsEiRKNS_11PointMatrixERNS_24ZigzagConnectorProcessorEbx = Module["__ZN4cura6Infill25generateLinearBasedInfillEiRNS_8PolygonsEiRKNS_11PointMatrixERNS_24ZigzagConnectorProcessorEbx"] = function () {
    return (__ZN4cura6Infill25generateLinearBasedInfillEiRNS_8PolygonsEiRKNS_11PointMatrixERNS_24ZigzagConnectorProcessorEbx = Module["__ZN4cura6Infill25generateLinearBasedInfillEiRNS_8PolygonsEiRKNS_11PointMatrixERNS_24ZigzagConnectorProcessorEbx"] = Module["asm"]["_b"]).apply(null, arguments)
};
var __ZN4cura6Infill19generateCubicInfillERNS_8PolygonsE = Module["__ZN4cura6Infill19generateCubicInfillERNS_8PolygonsE"] = function () {
    return (__ZN4cura6Infill19generateCubicInfillERNS_8PolygonsE = Module["__ZN4cura6Infill19generateCubicInfillERNS_8PolygonsE"] = Module["asm"]["$b"]).apply(null, arguments)
};
var __ZN4cura6Infill22generateTriangleInfillERNS_8PolygonsE = Module["__ZN4cura6Infill22generateTriangleInfillERNS_8PolygonsE"] = function () {
    return (__ZN4cura6Infill22generateTriangleInfillERNS_8PolygonsE = Module["__ZN4cura6Infill22generateTriangleInfillERNS_8PolygonsE"] = Module["asm"]["ac"]).apply(null, arguments)
};
var __ZN4cura6Infill24generateTrihexagonInfillERNS_8PolygonsE = Module["__ZN4cura6Infill24generateTrihexagonInfillERNS_8PolygonsE"] = function () {
    return (__ZN4cura6Infill24generateTrihexagonInfillERNS_8PolygonsE = Module["__ZN4cura6Infill24generateTrihexagonInfillERNS_8PolygonsE"] = Module["asm"]["bc"]).apply(null, arguments)
};
var __ZN4cura6Infill24generateConcentricInfillERNS_8PolygonsES2_i = Module["__ZN4cura6Infill24generateConcentricInfillERNS_8PolygonsES2_i"] = function () {
    return (__ZN4cura6Infill24generateConcentricInfillERNS_8PolygonsES2_i = Module["__ZN4cura6Infill24generateConcentricInfillERNS_8PolygonsES2_i"] = Module["asm"]["cc"]).apply(null, arguments)
};
var __ZN4cura6Infill21addLineSegmentsInfillERNS_8PolygonsES2_ = Module["__ZN4cura6Infill21addLineSegmentsInfillERNS_8PolygonsES2_"] = function () {
    return (__ZN4cura6Infill21addLineSegmentsInfillERNS_8PolygonsES2_ = Module["__ZN4cura6Infill21addLineSegmentsInfillERNS_8PolygonsES2_"] = Module["asm"]["dc"]).apply(null, arguments)
};
var __ZN4cura6Infill20generateGyroidInfillERNS_8PolygonsE = Module["__ZN4cura6Infill20generateGyroidInfillERNS_8PolygonsE"] = function () {
    return (__ZN4cura6Infill20generateGyroidInfillERNS_8PolygonsE = Module["__ZN4cura6Infill20generateGyroidInfillERNS_8PolygonsE"] = Module["asm"]["ec"]).apply(null, arguments)
};
var __ZN4cura6Infill29generateHalfTetrahedralInfillEfiRNS_8PolygonsE = Module["__ZN4cura6Infill29generateHalfTetrahedralInfillEfiRNS_8PolygonsE"] = function () {
    return (__ZN4cura6Infill29generateHalfTetrahedralInfillEfiRNS_8PolygonsE = Module["__ZN4cura6Infill29generateHalfTetrahedralInfillEfiRNS_8PolygonsE"] = Module["asm"]["fc"]).apply(null, arguments)
};
var __ZN4cura6Infill13addLineInfillERNS_8PolygonsERKNS_11PointMatrixEiiNS_4AABBERNSt3__26vectorINS8_IxNS7_9allocatorIxEEEENS9_ISB_EEEEx = Module["__ZN4cura6Infill13addLineInfillERNS_8PolygonsERKNS_11PointMatrixEiiNS_4AABBERNSt3__26vectorINS8_IxNS7_9allocatorIxEEEENS9_ISB_EEEEx"] = function () {
    return (__ZN4cura6Infill13addLineInfillERNS_8PolygonsERKNS_11PointMatrixEiiNS_4AABBERNSt3__26vectorINS8_IxNS7_9allocatorIxEEEENS9_ISB_EEEEx = Module["__ZN4cura6Infill13addLineInfillERNS_8PolygonsERKNS_11PointMatrixEiiNS_4AABBERNSt3__26vectorINS8_IxNS7_9allocatorIxEEEENS9_ISB_EEEEx"] = Module["asm"]["gc"]).apply(null, arguments)
};
var __ZNK4cura6Infill17InfillLineSegmenteqERKS1_ = Module["__ZNK4cura6Infill17InfillLineSegmenteqERKS1_"] = function () {
    return (__ZNK4cura6Infill17InfillLineSegmenteqERKS1_ = Module["__ZNK4cura6Infill17InfillLineSegmenteqERKS1_"] = Module["asm"]["hc"]).apply(null, arguments)
};
var __ZN4cura19InsetOrderOptimizer10moveInsideEv = Module["__ZN4cura19InsetOrderOptimizer10moveInsideEv"] = function () {
    return (__ZN4cura19InsetOrderOptimizer10moveInsideEv = Module["__ZN4cura19InsetOrderOptimizer10moveInsideEv"] = Module["asm"]["ic"]).apply(null, arguments)
};
var __ZN4cura19InsetOrderOptimizer17processHoleInsetsEv = Module["__ZN4cura19InsetOrderOptimizer17processHoleInsetsEv"] = function () {
    return (__ZN4cura19InsetOrderOptimizer17processHoleInsetsEv = Module["__ZN4cura19InsetOrderOptimizer17processHoleInsetsEv"] = Module["asm"]["jc"]).apply(null, arguments)
};
var __ZN4cura19InsetOrderOptimizer22processOuterWallInsetsEbb = Module["__ZN4cura19InsetOrderOptimizer22processOuterWallInsetsEbb"] = function () {
    return (__ZN4cura19InsetOrderOptimizer22processOuterWallInsetsEbb = Module["__ZN4cura19InsetOrderOptimizer22processOuterWallInsetsEbb"] = Module["asm"]["kc"]).apply(null, arguments)
};
var __ZN4cura19InsetOrderOptimizer34processInsetsWithOptimizedOrderingEv = Module["__ZN4cura19InsetOrderOptimizer34processInsetsWithOptimizedOrderingEv"] = function () {
    return (__ZN4cura19InsetOrderOptimizer34processInsetsWithOptimizedOrderingEv = Module["__ZN4cura19InsetOrderOptimizer34processInsetsWithOptimizedOrderingEv"] = Module["asm"]["lc"]).apply(null, arguments)
};
var __ZN4cura19InsetOrderOptimizer28optimizingInsetsIsWorthwhileERKNS_16SliceMeshStorageERKNS_14SliceLayerPartE = Module["__ZN4cura19InsetOrderOptimizer28optimizingInsetsIsWorthwhileERKNS_16SliceMeshStorageERKNS_14SliceLayerPartE"] = function () {
    return (__ZN4cura19InsetOrderOptimizer28optimizingInsetsIsWorthwhileERKNS_16SliceMeshStorageERKNS_14SliceLayerPartE = Module["__ZN4cura19InsetOrderOptimizer28optimizingInsetsIsWorthwhileERKNS_16SliceMeshStorageERKNS_14SliceLayerPartE"] = Module["asm"]["mc"]).apply(null, arguments)
};
var __ZN4cura20createLayerWithPartsERKNS_8SettingsERNS_10SliceLayerEPNS_11SlicerLayerE = Module["__ZN4cura20createLayerWithPartsERKNS_8SettingsERNS_10SliceLayerEPNS_11SlicerLayerE"] = function () {
    return (__ZN4cura20createLayerWithPartsERKNS_8SettingsERNS_10SliceLayerEPNS_11SlicerLayerE = Module["__ZN4cura20createLayerWithPartsERKNS_8SettingsERNS_10SliceLayerEPNS_11SlicerLayerE"] = Module["asm"]["nc"]).apply(null, arguments)
};
var __ZN4cura16createLayerPartsERNS_16SliceMeshStorageEPNS_6SlicerE = Module["__ZN4cura16createLayerPartsERNS_16SliceMeshStorageEPNS_6SlicerE"] = function () {
    return (__ZN4cura16createLayerPartsERNS_16SliceMeshStorageEPNS_6SlicerE = Module["__ZN4cura16createLayerPartsERNS_16SliceMeshStorageEPNS_6SlicerE"] = Module["asm"]["oc"]).apply(null, arguments)
};
var __ZN4cura12ExtruderPlan21setExtrudeSpeedFactorENS_5RatioE = Module["__ZN4cura12ExtruderPlan21setExtrudeSpeedFactorENS_5RatioE"] = function () {
    return (__ZN4cura12ExtruderPlan21setExtrudeSpeedFactorENS_5RatioE = Module["__ZN4cura12ExtruderPlan21setExtrudeSpeedFactorENS_5RatioE"] = Module["asm"]["pc"]).apply(null, arguments)
};
var __ZN4cura12ExtruderPlan21getExtrudeSpeedFactorEv = Module["__ZN4cura12ExtruderPlan21getExtrudeSpeedFactorEv"] = function () {
    return (__ZN4cura12ExtruderPlan21getExtrudeSpeedFactorEv = Module["__ZN4cura12ExtruderPlan21getExtrudeSpeedFactorEv"] = Module["asm"]["qc"]).apply(null, arguments)
};
var __ZN4cura12ExtruderPlan11setFanSpeedEd = Module["__ZN4cura12ExtruderPlan11setFanSpeedEd"] = function () {
    return (__ZN4cura12ExtruderPlan11setFanSpeedEd = Module["__ZN4cura12ExtruderPlan11setFanSpeedEd"] = Module["asm"]["rc"]).apply(null, arguments)
};
var __ZN4cura12ExtruderPlan11getFanSpeedEv = Module["__ZN4cura12ExtruderPlan11getFanSpeedEv"] = function () {
    return (__ZN4cura12ExtruderPlan11getFanSpeedEv = Module["__ZN4cura12ExtruderPlan11getFanSpeedEv"] = Module["asm"]["sc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan17forceNewPathStartEv = Module["__ZN4cura9LayerPlan17forceNewPathStartEv"] = function () {
    return (__ZN4cura9LayerPlan17forceNewPathStartEv = Module["__ZN4cura9LayerPlan17forceNewPathStartEv"] = Module["asm"]["tc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan11setIsInsideEb = Module["__ZN4cura9LayerPlan11setIsInsideEb"] = function () {
    return (__ZN4cura9LayerPlan11setIsInsideEb = Module["__ZN4cura9LayerPlan11setIsInsideEb"] = Module["asm"]["uc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan11setExtruderEm = Module["__ZN4cura9LayerPlan11setExtruderEm"] = function () {
    return (__ZN4cura9LayerPlan11setExtruderEm = Module["__ZN4cura9LayerPlan11setExtruderEm"] = Module["asm"]["vc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan22moveInsideCombBoundaryEx = Module["__ZN4cura9LayerPlan22moveInsideCombBoundaryEx"] = function () {
    return (__ZN4cura9LayerPlan22moveInsideCombBoundaryEx = Module["__ZN4cura9LayerPlan22moveInsideCombBoundaryEx"] = Module["asm"]["wc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan7setMeshENSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE = Module["__ZN4cura9LayerPlan7setMeshENSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE"] = function () {
    return (__ZN4cura9LayerPlan7setMeshENSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE = Module["__ZN4cura9LayerPlan7setMeshENSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE"] = Module["asm"]["xc"]).apply(null, arguments)
};
var __ZNK4cura9LayerPlan22getPrimeTowerIsPlannedEj = Module["__ZNK4cura9LayerPlan22getPrimeTowerIsPlannedEj"] = function () {
    return (__ZNK4cura9LayerPlan22getPrimeTowerIsPlannedEj = Module["__ZNK4cura9LayerPlan22getPrimeTowerIsPlannedEj"] = Module["asm"]["yc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan22setPrimeTowerIsPlannedEj = Module["__ZN4cura9LayerPlan22setPrimeTowerIsPlannedEj"] = function () {
    return (__ZN4cura9LayerPlan22setPrimeTowerIsPlannedEj = Module["__ZN4cura9LayerPlan22setPrimeTowerIsPlannedEj"] = Module["asm"]["zc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan9planPrimeEv = Module["__ZN4cura9LayerPlan9planPrimeEv"] = function () {
    return (__ZN4cura9LayerPlan9planPrimeEv = Module["__ZN4cura9LayerPlan9planPrimeEv"] = Module["asm"]["Ac"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan16addExtrusionMoveEN10ClipperLib8IntPointERKNS_15GCodePathConfigENS_13SpaceFillTypeERKNS_5RatioEbS7_d = Module["__ZN4cura9LayerPlan16addExtrusionMoveEN10ClipperLib8IntPointERKNS_15GCodePathConfigENS_13SpaceFillTypeERKNS_5RatioEbS7_d"] = function () {
    return (__ZN4cura9LayerPlan16addExtrusionMoveEN10ClipperLib8IntPointERKNS_15GCodePathConfigENS_13SpaceFillTypeERKNS_5RatioEbS7_d = Module["__ZN4cura9LayerPlan16addExtrusionMoveEN10ClipperLib8IntPointERKNS_15GCodePathConfigENS_13SpaceFillTypeERKNS_5RatioEbS7_d"] = Module["asm"]["Bc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan10addPolygonENS_15ConstPolygonRefEiRKNS_15GCodePathConfigEPNS_22WallOverlapComputationExbRKNS_5RatioEb = Module["__ZN4cura9LayerPlan10addPolygonENS_15ConstPolygonRefEiRKNS_15GCodePathConfigEPNS_22WallOverlapComputationExbRKNS_5RatioEb"] = function () {
    return (__ZN4cura9LayerPlan10addPolygonENS_15ConstPolygonRefEiRKNS_15GCodePathConfigEPNS_22WallOverlapComputationExbRKNS_5RatioEb = Module["__ZN4cura9LayerPlan10addPolygonENS_15ConstPolygonRefEiRKNS_15GCodePathConfigEPNS_22WallOverlapComputationExbRKNS_5RatioEb"] = Module["asm"]["Cc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan22addPolygonsByOptimizerERKNS_8PolygonsERKNS_15GCodePathConfigEPNS_22WallOverlapComputationERKNS_11ZSeamConfigExbNS_5RatioEbb = Module["__ZN4cura9LayerPlan22addPolygonsByOptimizerERKNS_8PolygonsERKNS_15GCodePathConfigEPNS_22WallOverlapComputationERKNS_11ZSeamConfigExbNS_5RatioEbb"] = function () {
    return (__ZN4cura9LayerPlan22addPolygonsByOptimizerERKNS_8PolygonsERKNS_15GCodePathConfigEPNS_22WallOverlapComputationERKNS_11ZSeamConfigExbNS_5RatioEbb = Module["__ZN4cura9LayerPlan22addPolygonsByOptimizerERKNS_8PolygonsERKNS_15GCodePathConfigEPNS_22WallOverlapComputationERKNS_11ZSeamConfigExbNS_5RatioEbb"] = Module["asm"]["Dc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan11addWallLineERKN10ClipperLib8IntPointES4_RKNS_16SliceMeshStorageERKNS_15GCodePathConfigESA_fRfNS_5RatioEd = Module["__ZN4cura9LayerPlan11addWallLineERKN10ClipperLib8IntPointES4_RKNS_16SliceMeshStorageERKNS_15GCodePathConfigESA_fRfNS_5RatioEd"] = function () {
    return (__ZN4cura9LayerPlan11addWallLineERKN10ClipperLib8IntPointES4_RKNS_16SliceMeshStorageERKNS_15GCodePathConfigESA_fRfNS_5RatioEd = Module["__ZN4cura9LayerPlan11addWallLineERKN10ClipperLib8IntPointES4_RKNS_16SliceMeshStorageERKNS_15GCodePathConfigESA_fRfNS_5RatioEd"] = Module["asm"]["Ec"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan7addWallENS_15ConstPolygonRefEiRKNS_16SliceMeshStorageERKNS_15GCodePathConfigES7_PNS_22WallOverlapComputationExfb = Module["__ZN4cura9LayerPlan7addWallENS_15ConstPolygonRefEiRKNS_16SliceMeshStorageERKNS_15GCodePathConfigES7_PNS_22WallOverlapComputationExfb"] = function () {
    return (__ZN4cura9LayerPlan7addWallENS_15ConstPolygonRefEiRKNS_16SliceMeshStorageERKNS_15GCodePathConfigES7_PNS_22WallOverlapComputationExfb = Module["__ZN4cura9LayerPlan7addWallENS_15ConstPolygonRefEiRKNS_16SliceMeshStorageERKNS_15GCodePathConfigES7_PNS_22WallOverlapComputationExfb"] = Module["asm"]["Fc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan8addWallsERKNS_8PolygonsERKNS_16SliceMeshStorageERKNS_15GCodePathConfigES9_PNS_22WallOverlapComputationERKNS_11ZSeamConfigExfb = Module["__ZN4cura9LayerPlan8addWallsERKNS_8PolygonsERKNS_16SliceMeshStorageERKNS_15GCodePathConfigES9_PNS_22WallOverlapComputationERKNS_11ZSeamConfigExfb"] = function () {
    return (__ZN4cura9LayerPlan8addWallsERKNS_8PolygonsERKNS_16SliceMeshStorageERKNS_15GCodePathConfigES9_PNS_22WallOverlapComputationERKNS_11ZSeamConfigExfb = Module["__ZN4cura9LayerPlan8addWallsERKNS_8PolygonsERKNS_16SliceMeshStorageERKNS_15GCodePathConfigES9_PNS_22WallOverlapComputationERKNS_11ZSeamConfigExfb"] = Module["asm"]["Gc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan19addLinesByOptimizerERKNS_8PolygonsERKNS_15GCodePathConfigENS_13SpaceFillTypeEbifSt8optionalIN10ClipperLib8IntPointEEd = Module["__ZN4cura9LayerPlan19addLinesByOptimizerERKNS_8PolygonsERKNS_15GCodePathConfigENS_13SpaceFillTypeEbifSt8optionalIN10ClipperLib8IntPointEEd"] = function () {
    return (__ZN4cura9LayerPlan19addLinesByOptimizerERKNS_8PolygonsERKNS_15GCodePathConfigENS_13SpaceFillTypeEbifSt8optionalIN10ClipperLib8IntPointEEd = Module["__ZN4cura9LayerPlan19addLinesByOptimizerERKNS_8PolygonsERKNS_15GCodePathConfigENS_13SpaceFillTypeEbifSt8optionalIN10ClipperLib8IntPointEEd"] = Module["asm"]["Hc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan18spiralizeWallSliceERKNS_15GCodePathConfigENS_15ConstPolygonRefES4_ii = Module["__ZN4cura9LayerPlan18spiralizeWallSliceERKNS_15GCodePathConfigENS_15ConstPolygonRefES4_ii"] = function () {
    return (__ZN4cura9LayerPlan18spiralizeWallSliceERKNS_15GCodePathConfigENS_15ConstPolygonRefES4_ii = Module["__ZN4cura9LayerPlan18spiralizeWallSliceERKNS_15GCodePathConfigENS_15ConstPolygonRefES4_ii"] = Module["asm"]["Ic"]).apply(null, arguments)
};
var __ZN4cura12ExtruderPlan21forceMinimalLayerTimeEdddd = Module["__ZN4cura12ExtruderPlan21forceMinimalLayerTimeEdddd"] = function () {
    return (__ZN4cura12ExtruderPlan21forceMinimalLayerTimeEdddd = Module["__ZN4cura12ExtruderPlan21forceMinimalLayerTimeEdddd"] = Module["asm"]["Jc"]).apply(null, arguments)
};
var __ZN4cura12ExtruderPlan34processFanSpeedAndMinimalLayerTimeEbN10ClipperLib8IntPointE = Module["__ZN4cura12ExtruderPlan34processFanSpeedAndMinimalLayerTimeEbN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura12ExtruderPlan34processFanSpeedAndMinimalLayerTimeEbN10ClipperLib8IntPointE = Module["__ZN4cura12ExtruderPlan34processFanSpeedAndMinimalLayerTimeEbN10ClipperLib8IntPointE"] = Module["asm"]["Kc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan34processFanSpeedAndMinimalLayerTimeEN10ClipperLib8IntPointE = Module["__ZN4cura9LayerPlan34processFanSpeedAndMinimalLayerTimeEN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura9LayerPlan34processFanSpeedAndMinimalLayerTimeEN10ClipperLib8IntPointE = Module["__ZN4cura9LayerPlan34processFanSpeedAndMinimalLayerTimeEN10ClipperLib8IntPointE"] = Module["asm"]["Lc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan10writeGCodeERNS_11GCodeExportE = Module["__ZN4cura9LayerPlan10writeGCodeERNS_11GCodeExportE"] = function () {
    return (__ZN4cura9LayerPlan10writeGCodeERNS_11GCodeExportE = Module["__ZN4cura9LayerPlan10writeGCodeERNS_11GCodeExportE"] = Module["asm"]["Mc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan21writePathWithCoastingERNS_11GCodeExportEmmx = Module["__ZN4cura9LayerPlan21writePathWithCoastingERNS_11GCodeExportEmmx"] = function () {
    return (__ZN4cura9LayerPlan21writePathWithCoastingERNS_11GCodeExportEmmx = Module["__ZN4cura9LayerPlan21writePathWithCoastingERNS_11GCodeExportEmmx"] = Module["asm"]["Nc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan17overrideFanSpeedsEd = Module["__ZN4cura9LayerPlan17overrideFanSpeedsEd"] = function () {
    return (__ZN4cura9LayerPlan17overrideFanSpeedsEd = Module["__ZN4cura9LayerPlan17overrideFanSpeedsEd"] = Module["asm"]["Oc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan24makeRetractSwitchRetractEjj = Module["__ZN4cura9LayerPlan24makeRetractSwitchRetractEjj"] = function () {
    return (__ZN4cura9LayerPlan24makeRetractSwitchRetractEjj = Module["__ZN4cura9LayerPlan24makeRetractSwitchRetractEjj"] = Module["asm"]["Pc"]).apply(null, arguments)
};
var __ZN4cura9LayerPlan13optimizePathsERKN10ClipperLib8IntPointE = Module["__ZN4cura9LayerPlan13optimizePathsERKN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura9LayerPlan13optimizePathsERKN10ClipperLib8IntPointE = Module["__ZN4cura9LayerPlan13optimizePathsERKN10ClipperLib8IntPointE"] = Module["asm"]["Qc"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer4pushERNS_9LayerPlanE = Module["__ZN4cura15LayerPlanBuffer4pushERNS_9LayerPlanE"] = function () {
    return (__ZN4cura15LayerPlanBuffer4pushERNS_9LayerPlanE = Module["__ZN4cura15LayerPlanBuffer4pushERNS_9LayerPlanE"] = Module["asm"]["Rc"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer6handleERNS_9LayerPlanERNS_11GCodeExportE = Module["__ZN4cura15LayerPlanBuffer6handleERNS_9LayerPlanERNS_11GCodeExportE"] = function () {
    return (__ZN4cura15LayerPlanBuffer6handleERNS_9LayerPlanERNS_11GCodeExportE = Module["__ZN4cura15LayerPlanBuffer6handleERNS_9LayerPlanERNS_11GCodeExportE"] = Module["asm"]["Sc"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer23addConnectingTravelMoveEPNS_9LayerPlanEPKS1_ = Module["__ZN4cura15LayerPlanBuffer23addConnectingTravelMoveEPNS_9LayerPlanEPKS1_"] = function () {
    return (__ZN4cura15LayerPlanBuffer23addConnectingTravelMoveEPNS_9LayerPlanEPKS1_ = Module["__ZN4cura15LayerPlanBuffer23addConnectingTravelMoveEPNS_9LayerPlanEPKS1_"] = Module["asm"]["Tc"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer18insertTempCommandsEv = Module["__ZN4cura15LayerPlanBuffer18insertTempCommandsEv"] = function () {
    return (__ZN4cura15LayerPlanBuffer18insertTempCommandsEv = Module["__ZN4cura15LayerPlanBuffer18insertTempCommandsEv"] = Module["asm"]["Uc"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer24processFanSpeedLayerTimeEv = Module["__ZN4cura15LayerPlanBuffer24processFanSpeedLayerTimeEv"] = function () {
    return (__ZN4cura15LayerPlanBuffer24processFanSpeedLayerTimeEv = Module["__ZN4cura15LayerPlanBuffer24processFanSpeedLayerTimeEv"] = Module["asm"]["Vc"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer18insertTempCommandsERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj = Module["__ZN4cura15LayerPlanBuffer18insertTempCommandsERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj"] = function () {
    return (__ZN4cura15LayerPlanBuffer18insertTempCommandsERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj = Module["__ZN4cura15LayerPlanBuffer18insertTempCommandsERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj"] = Module["asm"]["Wc"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer5flushEv = Module["__ZN4cura15LayerPlanBuffer5flushEv"] = function () {
    return (__ZN4cura15LayerPlanBuffer5flushEv = Module["__ZN4cura15LayerPlanBuffer5flushEv"] = Module["asm"]["Xc"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer20insertPreheatCommandERNS_12ExtruderPlanENS_8DurationEmNS_11TemperatureE = Module["__ZN4cura15LayerPlanBuffer20insertPreheatCommandERNS_12ExtruderPlanENS_8DurationEmNS_11TemperatureE"] = function () {
    return (__ZN4cura15LayerPlanBuffer20insertPreheatCommandERNS_12ExtruderPlanENS_8DurationEmNS_11TemperatureE = Module["__ZN4cura15LayerPlanBuffer20insertPreheatCommandERNS_12ExtruderPlanENS_8DurationEmNS_11TemperatureE"] = Module["asm"]["Yc"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer36insertPreheatCommand_singleExtrusionERNS_12ExtruderPlanEmNS_11TemperatureE = Module["__ZN4cura15LayerPlanBuffer36insertPreheatCommand_singleExtrusionERNS_12ExtruderPlanEmNS_11TemperatureE"] = function () {
    return (__ZN4cura15LayerPlanBuffer36insertPreheatCommand_singleExtrusionERNS_12ExtruderPlanEmNS_11TemperatureE = Module["__ZN4cura15LayerPlanBuffer36insertPreheatCommand_singleExtrusionERNS_12ExtruderPlanEmNS_11TemperatureE"] = Module["asm"]["Zc"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer17handleStandbyTempERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEjd = Module["__ZN4cura15LayerPlanBuffer17handleStandbyTempERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEjd"] = function () {
    return (__ZN4cura15LayerPlanBuffer17handleStandbyTempERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEjd = Module["__ZN4cura15LayerPlanBuffer17handleStandbyTempERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEjd"] = Module["asm"]["_c"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer35insertPreheatCommand_multiExtrusionERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj = Module["__ZN4cura15LayerPlanBuffer35insertPreheatCommand_multiExtrusionERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj"] = function () {
    return (__ZN4cura15LayerPlanBuffer35insertPreheatCommand_multiExtrusionERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj = Module["__ZN4cura15LayerPlanBuffer35insertPreheatCommand_multiExtrusionERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj"] = Module["asm"]["$c"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer27insertFinalPrintTempCommandERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj = Module["__ZN4cura15LayerPlanBuffer27insertFinalPrintTempCommandERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj"] = function () {
    return (__ZN4cura15LayerPlanBuffer27insertFinalPrintTempCommandERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj = Module["__ZN4cura15LayerPlanBuffer27insertFinalPrintTempCommandERNSt3__26vectorIPNS_12ExtruderPlanENS1_9allocatorIS4_EEEEj"] = Module["asm"]["ad"]).apply(null, arguments)
};
var __ZN4cura15LayerPlanBuffer22insertPrintTempCommandERNS_12ExtruderPlanE = Module["__ZN4cura15LayerPlanBuffer22insertPrintTempCommandERNS_12ExtruderPlanE"] = function () {
    return (__ZN4cura15LayerPlanBuffer22insertPrintTempCommandERNS_12ExtruderPlanE = Module["__ZN4cura15LayerPlanBuffer22insertPrintTempCommandERNS_12ExtruderPlanE"] = Module["asm"]["bd"]).apply(null, arguments)
};
var __ZN4cura4Mesh7addFaceERNS_6Point3ES2_S2_ = Module["__ZN4cura4Mesh7addFaceERNS_6Point3ES2_S2_"] = function () {
    return (__ZN4cura4Mesh7addFaceERNS_6Point3ES2_S2_ = Module["__ZN4cura4Mesh7addFaceERNS_6Point3ES2_S2_"] = Module["asm"]["cd"]).apply(null, arguments)
};
var __ZN4cura4Mesh17findIndexOfVertexERKNS_6Point3E = Module["__ZN4cura4Mesh17findIndexOfVertexERKNS_6Point3E"] = function () {
    return (__ZN4cura4Mesh17findIndexOfVertexERKNS_6Point3E = Module["__ZN4cura4Mesh17findIndexOfVertexERKNS_6Point3E"] = Module["asm"]["dd"]).apply(null, arguments)
};
var __ZN4cura4Mesh5clearEv = Module["__ZN4cura4Mesh5clearEv"] = function () {
    return (__ZN4cura4Mesh5clearEv = Module["__ZN4cura4Mesh5clearEv"] = Module["asm"]["ed"]).apply(null, arguments)
};
var __ZN4cura4Mesh6finishEv = Module["__ZN4cura4Mesh6finishEv"] = function () {
    return (__ZN4cura4Mesh6finishEv = Module["__ZN4cura4Mesh6finishEv"] = Module["asm"]["fd"]).apply(null, arguments)
};
var __ZNK4cura4Mesh20getFaceIdxWithPointsEiiii = Module["__ZNK4cura4Mesh20getFaceIdxWithPointsEiiii"] = function () {
    return (__ZNK4cura4Mesh20getFaceIdxWithPointsEiiii = Module["__ZNK4cura4Mesh20getFaceIdxWithPointsEiiii"] = Module["asm"]["gd"]).apply(null, arguments)
};
var __ZN4cura4Mesh8expandXYEx = Module["__ZN4cura4Mesh8expandXYEx"] = function () {
    return (__ZN4cura4Mesh8expandXYEx = Module["__ZN4cura4Mesh8expandXYEx"] = Module["asm"]["hd"]).apply(null, arguments)
};
var __ZN4cura9MeshGroup5clearEv = Module["__ZN4cura9MeshGroup5clearEv"] = function () {
    return (__ZN4cura9MeshGroup5clearEv = Module["__ZN4cura9MeshGroup5clearEv"] = Module["asm"]["id"]).apply(null, arguments)
};
var __ZN4cura9MeshGroup8finalizeEv = Module["__ZN4cura9MeshGroup8finalizeEv"] = function () {
    return (__ZN4cura9MeshGroup8finalizeEv = Module["__ZN4cura9MeshGroup8finalizeEv"] = Module["asm"]["jd"]).apply(null, arguments)
};
var __ZN4cura17loadMeshSTL_asciiEPNS_4MeshEPKcRKNS_10FMatrix3x3E = Module["__ZN4cura17loadMeshSTL_asciiEPNS_4MeshEPKcRKNS_10FMatrix3x3E"] = function () {
    return (__ZN4cura17loadMeshSTL_asciiEPNS_4MeshEPKcRKNS_10FMatrix3x3E = Module["__ZN4cura17loadMeshSTL_asciiEPNS_4MeshEPKcRKNS_10FMatrix3x3E"] = Module["asm"]["kd"]).apply(null, arguments)
};
var __ZN4cura18loadMeshSTL_binaryEPNS_4MeshEPKcRKNS_10FMatrix3x3E = Module["__ZN4cura18loadMeshSTL_binaryEPNS_4MeshEPKcRKNS_10FMatrix3x3E"] = function () {
    return (__ZN4cura18loadMeshSTL_binaryEPNS_4MeshEPKcRKNS_10FMatrix3x3E = Module["__ZN4cura18loadMeshSTL_binaryEPNS_4MeshEPKcRKNS_10FMatrix3x3E"] = Module["asm"]["ld"]).apply(null, arguments)
};
var __ZN4cura11loadMeshSTLEPNS_4MeshEPKcRKNS_10FMatrix3x3E = Module["__ZN4cura11loadMeshSTLEPNS_4MeshEPKcRKNS_10FMatrix3x3E"] = function () {
    return (__ZN4cura11loadMeshSTLEPNS_4MeshEPKcRKNS_10FMatrix3x3E = Module["__ZN4cura11loadMeshSTLEPNS_4MeshEPKcRKNS_10FMatrix3x3E"] = Module["asm"]["md"]).apply(null, arguments)
};
var __ZN4cura21loadMeshIntoMeshGroupEPNS_9MeshGroupEPKcRKNS_10FMatrix3x3ERNS_8SettingsE = Module["__ZN4cura21loadMeshIntoMeshGroupEPNS_9MeshGroupEPKcRKNS_10FMatrix3x3ERNS_8SettingsE"] = function () {
    return (__ZN4cura21loadMeshIntoMeshGroupEPNS_9MeshGroupEPKcRKNS_10FMatrix3x3ERNS_8SettingsE = Module["__ZN4cura21loadMeshIntoMeshGroupEPNS_9MeshGroupEPKcRKNS_10FMatrix3x3ERNS_8SettingsE"] = Module["asm"]["nd"]).apply(null, arguments)
};
var __ZN4cura4Mold7processERNSt3__26vectorIPNS_6SlicerENS1_9allocatorIS4_EEEE = Module["__ZN4cura4Mold7processERNSt3__26vectorIPNS_6SlicerENS1_9allocatorIS4_EEEE"] = function () {
    return (__ZN4cura4Mold7processERNSt3__26vectorIPNS_6SlicerENS1_9allocatorIS4_EEEE = Module["__ZN4cura4Mold7processERNSt3__26vectorIPNS_6SlicerENS1_9allocatorIS4_EEEE"] = Module["asm"]["od"]).apply(null, arguments)
};
var __ZN4cura18PathOrderOptimizer8optimizeEv = Module["__ZN4cura18PathOrderOptimizer8optimizeEv"] = function () {
    return (__ZN4cura18PathOrderOptimizer8optimizeEv = Module["__ZN4cura18PathOrderOptimizer8optimizeEv"] = Module["asm"]["pd"]).apply(null, arguments)
};
var __ZN4cura18PathOrderOptimizer24getClosestPointInPolygonEN10ClipperLib8IntPointEi = Module["__ZN4cura18PathOrderOptimizer24getClosestPointInPolygonEN10ClipperLib8IntPointEi"] = function () {
    return (__ZN4cura18PathOrderOptimizer24getClosestPointInPolygonEN10ClipperLib8IntPointEi = Module["__ZN4cura18PathOrderOptimizer24getClosestPointInPolygonEN10ClipperLib8IntPointEi"] = Module["asm"]["qd"]).apply(null, arguments)
};
var __ZN4cura18PathOrderOptimizer23getRandomPointInPolygonEi = Module["__ZN4cura18PathOrderOptimizer23getRandomPointInPolygonEi"] = function () {
    return (__ZN4cura18PathOrderOptimizer23getRandomPointInPolygonEi = Module["__ZN4cura18PathOrderOptimizer23getRandomPointInPolygonEi"] = Module["asm"]["rd"]).apply(null, arguments)
};
var __ZN4cura18LineOrderOptimizer8optimizeEb = Module["__ZN4cura18LineOrderOptimizer8optimizeEb"] = function () {
    return (__ZN4cura18LineOrderOptimizer8optimizeEb = Module["__ZN4cura18LineOrderOptimizer8optimizeEb"] = Module["asm"]["sd"]).apply(null, arguments)
};
var __ZN4cura18LineOrderOptimizer16combingDistance2ERKN10ClipperLib8IntPointES4_ = Module["__ZN4cura18LineOrderOptimizer16combingDistance2ERKN10ClipperLib8IntPointES4_"] = function () {
    return (__ZN4cura18LineOrderOptimizer16combingDistance2ERKN10ClipperLib8IntPointES4_ = Module["__ZN4cura18LineOrderOptimizer16combingDistance2ERKN10ClipperLib8IntPointES4_"] = Module["asm"]["td"]).apply(null, arguments)
};
var __ZN4cura10PrimeTower18generateGroundpolyEv = Module["__ZN4cura10PrimeTower18generateGroundpolyEv"] = function () {
    return (__ZN4cura10PrimeTower18generateGroundpolyEv = Module["__ZN4cura10PrimeTower18generateGroundpolyEv"] = Module["asm"]["ud"]).apply(null, arguments)
};
var __ZN4cura10PrimeTower13generatePathsERKNS_16SliceDataStorageE = Module["__ZN4cura10PrimeTower13generatePathsERKNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura10PrimeTower13generatePathsERKNS_16SliceDataStorageE = Module["__ZN4cura10PrimeTower13generatePathsERKNS_16SliceDataStorageE"] = Module["asm"]["vd"]).apply(null, arguments)
};
var __ZN4cura10PrimeTower25generatePaths_denseInfillEv = Module["__ZN4cura10PrimeTower25generatePaths_denseInfillEv"] = function () {
    return (__ZN4cura10PrimeTower25generatePaths_denseInfillEv = Module["__ZN4cura10PrimeTower25generatePaths_denseInfillEv"] = Module["asm"]["wd"]).apply(null, arguments)
};
var __ZN4cura10PrimeTower22generateStartLocationsEv = Module["__ZN4cura10PrimeTower22generateStartLocationsEv"] = function () {
    return (__ZN4cura10PrimeTower22generateStartLocationsEv = Module["__ZN4cura10PrimeTower22generateStartLocationsEv"] = Module["asm"]["xd"]).apply(null, arguments)
};
var __ZNK4cura10PrimeTower10addToGcodeERKNS_16SliceDataStorageERNS_9LayerPlanEii = Module["__ZNK4cura10PrimeTower10addToGcodeERKNS_16SliceDataStorageERNS_9LayerPlanEii"] = function () {
    return (__ZNK4cura10PrimeTower10addToGcodeERKNS_16SliceDataStorageERNS_9LayerPlanEii = Module["__ZNK4cura10PrimeTower10addToGcodeERKNS_16SliceDataStorageERNS_9LayerPlanEii"] = Module["asm"]["yd"]).apply(null, arguments)
};
var __ZNK4cura10PrimeTower17gotoStartLocationERNS_9LayerPlanEi = Module["__ZNK4cura10PrimeTower17gotoStartLocationERNS_9LayerPlanEi"] = function () {
    return (__ZNK4cura10PrimeTower17gotoStartLocationERNS_9LayerPlanEi = Module["__ZNK4cura10PrimeTower17gotoStartLocationERNS_9LayerPlanEi"] = Module["asm"]["zd"]).apply(null, arguments)
};
var __ZNK4cura10PrimeTower22addToGcode_denseInfillERNS_9LayerPlanEm = Module["__ZNK4cura10PrimeTower22addToGcode_denseInfillERNS_9LayerPlanEm"] = function () {
    return (__ZNK4cura10PrimeTower22addToGcode_denseInfillERNS_9LayerPlanEm = Module["__ZNK4cura10PrimeTower22addToGcode_denseInfillERNS_9LayerPlanEm"] = Module["asm"]["Ad"]).apply(null, arguments)
};
var __ZN4cura10PrimeTower19subtractFromSupportERNS_16SliceDataStorageE = Module["__ZN4cura10PrimeTower19subtractFromSupportERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura10PrimeTower19subtractFromSupportERNS_16SliceDataStorageE = Module["__ZN4cura10PrimeTower19subtractFromSupportERNS_16SliceDataStorageE"] = Module["asm"]["Bd"]).apply(null, arguments)
};
var __ZN4cura4Raft8generateERNS_16SliceDataStorageE = Module["__ZN4cura4Raft8generateERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura4Raft8generateERNS_16SliceDataStorageE = Module["__ZN4cura4Raft8generateERNS_16SliceDataStorageE"] = Module["asm"]["Cd"]).apply(null, arguments)
};
var __ZN4cura5Scene16processMeshGroupERNS_9MeshGroupE = Module["__ZN4cura5Scene16processMeshGroupERNS_9MeshGroupE"] = function () {
    return (__ZN4cura5Scene16processMeshGroupERNS_9MeshGroupE = Module["__ZN4cura5Scene16processMeshGroupERNS_9MeshGroupE"] = Module["asm"]["Dd"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation22generateSkinsAndInfillEv = Module["__ZN4cura25SkinInfillAreaComputation22generateSkinsAndInfillEv"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation22generateSkinsAndInfillEv = Module["__ZN4cura25SkinInfillAreaComputation22generateSkinsAndInfillEv"] = Module["asm"]["Ed"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation26generateSkinAndInfillAreasERNS_14SliceLayerPartE = Module["__ZN4cura25SkinInfillAreaComputation26generateSkinAndInfillAreasERNS_14SliceLayerPartE"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation26generateSkinAndInfillAreasERNS_14SliceLayerPartE = Module["__ZN4cura25SkinInfillAreaComputation26generateSkinAndInfillAreasERNS_14SliceLayerPartE"] = Module["asm"]["Fd"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation18generateSkinInsetsERNS_8SkinPartE = Module["__ZN4cura25SkinInfillAreaComputation18generateSkinInsetsERNS_8SkinPartE"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation18generateSkinInsetsERNS_8SkinPartE = Module["__ZN4cura25SkinInfillAreaComputation18generateSkinInsetsERNS_8SkinPartE"] = Module["asm"]["Gd"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation15generateRoofingERNS_14SliceLayerPartE = Module["__ZN4cura25SkinInfillAreaComputation15generateRoofingERNS_14SliceLayerPartE"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation15generateRoofingERNS_14SliceLayerPartE = Module["__ZN4cura25SkinInfillAreaComputation15generateRoofingERNS_14SliceLayerPartE"] = Module["asm"]["Hd"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation26generateSkinAndInfillAreasEv = Module["__ZN4cura25SkinInfillAreaComputation26generateSkinAndInfillAreasEv"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation26generateSkinAndInfillAreasEv = Module["__ZN4cura25SkinInfillAreaComputation26generateSkinAndInfillAreasEv"] = Module["asm"]["Id"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation36generateSkinInsetsAndInnerSkinInfillEPNS_14SliceLayerPartE = Module["__ZN4cura25SkinInfillAreaComputation36generateSkinInsetsAndInnerSkinInfillEPNS_14SliceLayerPartE"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation36generateSkinInsetsAndInnerSkinInfillEPNS_14SliceLayerPartE = Module["__ZN4cura25SkinInfillAreaComputation36generateSkinInsetsAndInnerSkinInfillEPNS_14SliceLayerPartE"] = Module["asm"]["Jd"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation23generateInnerSkinInfillERNS_8SkinPartE = Module["__ZN4cura25SkinInfillAreaComputation23generateInnerSkinInfillERNS_8SkinPartE"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation23generateInnerSkinInfillERNS_8SkinPartE = Module["__ZN4cura25SkinInfillAreaComputation23generateInnerSkinInfillERNS_8SkinPartE"] = Module["asm"]["Kd"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation19calculateBottomSkinERKNS_14SliceLayerPartERNS_8PolygonsE = Module["__ZN4cura25SkinInfillAreaComputation19calculateBottomSkinERKNS_14SliceLayerPartERNS_8PolygonsE"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation19calculateBottomSkinERKNS_14SliceLayerPartERNS_8PolygonsE = Module["__ZN4cura25SkinInfillAreaComputation19calculateBottomSkinERKNS_14SliceLayerPartERNS_8PolygonsE"] = Module["asm"]["Ld"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation16calculateTopSkinERKNS_14SliceLayerPartERNS_8PolygonsE = Module["__ZN4cura25SkinInfillAreaComputation16calculateTopSkinERKNS_14SliceLayerPartERNS_8PolygonsE"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation16calculateTopSkinERKNS_14SliceLayerPartERNS_8PolygonsE = Module["__ZN4cura25SkinInfillAreaComputation16calculateTopSkinERKNS_14SliceLayerPartERNS_8PolygonsE"] = Module["asm"]["Md"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation18applySkinExpansionERKNS_8PolygonsERS1_S4_ = Module["__ZN4cura25SkinInfillAreaComputation18applySkinExpansionERKNS_8PolygonsERS1_S4_"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation18applySkinExpansionERKNS_8PolygonsERS1_S4_ = Module["__ZN4cura25SkinInfillAreaComputation18applySkinExpansionERKNS_8PolygonsERS1_S4_"] = Module["asm"]["Nd"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation14generateInfillERNS_14SliceLayerPartERKNS_8PolygonsE = Module["__ZN4cura25SkinInfillAreaComputation14generateInfillERNS_14SliceLayerPartERKNS_8PolygonsE"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation14generateInfillERNS_14SliceLayerPartERKNS_8PolygonsE = Module["__ZN4cura25SkinInfillAreaComputation14generateInfillERNS_14SliceLayerPartERKNS_8PolygonsE"] = Module["asm"]["Od"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation21generateInfillSupportERNS_16SliceMeshStorageE = Module["__ZN4cura25SkinInfillAreaComputation21generateInfillSupportERNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation21generateInfillSupportERNS_16SliceMeshStorageE = Module["__ZN4cura25SkinInfillAreaComputation21generateInfillSupportERNS_16SliceMeshStorageE"] = Module["asm"]["Pd"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation21generateGradualInfillERNS_16SliceMeshStorageE = Module["__ZN4cura25SkinInfillAreaComputation21generateGradualInfillERNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation21generateGradualInfillERNS_16SliceMeshStorageE = Module["__ZN4cura25SkinInfillAreaComputation21generateGradualInfillERNS_16SliceMeshStorageE"] = Module["asm"]["Qd"]).apply(null, arguments)
};
var __ZN4cura25SkinInfillAreaComputation19combineInfillLayersERNS_16SliceMeshStorageE = Module["__ZN4cura25SkinInfillAreaComputation19combineInfillLayersERNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura25SkinInfillAreaComputation19combineInfillLayersERNS_16SliceMeshStorageE = Module["__ZN4cura25SkinInfillAreaComputation19combineInfillLayersERNS_16SliceMeshStorageE"] = Module["asm"]["Rd"]).apply(null, arguments)
};
var __ZN4cura9SkirtBrim20getFirstLayerOutlineERNS_16SliceDataStorageEmbRNS_8PolygonsE = Module["__ZN4cura9SkirtBrim20getFirstLayerOutlineERNS_16SliceDataStorageEmbRNS_8PolygonsE"] = function () {
    return (__ZN4cura9SkirtBrim20getFirstLayerOutlineERNS_16SliceDataStorageEmbRNS_8PolygonsE = Module["__ZN4cura9SkirtBrim20getFirstLayerOutlineERNS_16SliceDataStorageEmbRNS_8PolygonsE"] = Module["asm"]["Sd"]).apply(null, arguments)
};
var __ZN4cura9SkirtBrim29generatePrimarySkirtBrimLinesExmxRKNS_8PolygonsERS1_ = Module["__ZN4cura9SkirtBrim29generatePrimarySkirtBrimLinesExmxRKNS_8PolygonsERS1_"] = function () {
    return (__ZN4cura9SkirtBrim29generatePrimarySkirtBrimLinesExmxRKNS_8PolygonsERS1_ = Module["__ZN4cura9SkirtBrim29generatePrimarySkirtBrimLinesExmxRKNS_8PolygonsERS1_"] = Module["asm"]["Td"]).apply(null, arguments)
};
var __ZN4cura9SkirtBrim8generateERNS_16SliceDataStorageEij = Module["__ZN4cura9SkirtBrim8generateERNS_16SliceDataStorageEij"] = function () {
    return (__ZN4cura9SkirtBrim8generateERNS_16SliceDataStorageEij = Module["__ZN4cura9SkirtBrim8generateERNS_16SliceDataStorageEij"] = Module["asm"]["Ud"]).apply(null, arguments)
};
var __ZN4cura9SkirtBrim19generateSupportBrimERNS_16SliceDataStorageE = Module["__ZN4cura9SkirtBrim19generateSupportBrimERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura9SkirtBrim19generateSupportBrimERNS_16SliceDataStorageE = Module["__ZN4cura9SkirtBrim19generateSupportBrimERNS_16SliceDataStorageE"] = Module["asm"]["Vd"]).apply(null, arguments)
};
var __ZN4cura17SupportInfillPart28generateInsetsAndInfillAreasEv = Module["__ZN4cura17SupportInfillPart28generateInsetsAndInfillAreasEv"] = function () {
    return (__ZN4cura17SupportInfillPart28generateInsetsAndInfillAreasEv = Module["__ZN4cura17SupportInfillPart28generateInsetsAndInfillAreasEv"] = Module["asm"]["Wd"]).apply(null, arguments)
};
var __ZN4cura5Slice7computeEv = Module["__ZN4cura5Slice7computeEv"] = function () {
    return (__ZN4cura5Slice7computeEv = Module["__ZN4cura5Slice7computeEv"] = Module["asm"]["Xd"]).apply(null, arguments)
};
var __ZN4cura5Slice5resetEv = Module["__ZN4cura5Slice5resetEv"] = function () {
    return (__ZN4cura5Slice5resetEv = Module["__ZN4cura5Slice5resetEv"] = Module["asm"]["Yd"]).apply(null, arguments)
};
var __ZNK4cura10SliceLayer11getOutlinesERNS_8PolygonsEb = Module["__ZNK4cura10SliceLayer11getOutlinesERNS_8PolygonsEb"] = function () {
    return (__ZNK4cura10SliceLayer11getOutlinesERNS_8PolygonsEb = Module["__ZNK4cura10SliceLayer11getOutlinesERNS_8PolygonsEb"] = Module["asm"]["Zd"]).apply(null, arguments)
};
var __ZNK4cura16SliceMeshStorage17getExtruderIsUsedEm = Module["__ZNK4cura16SliceMeshStorage17getExtruderIsUsedEm"] = function () {
    return (__ZNK4cura16SliceMeshStorage17getExtruderIsUsedEm = Module["__ZNK4cura16SliceMeshStorage17getExtruderIsUsedEm"] = Module["asm"]["_d"]).apply(null, arguments)
};
var __ZNK4cura16SliceMeshStorage17getExtruderIsUsedEmRKNS_10LayerIndexE = Module["__ZNK4cura16SliceMeshStorage17getExtruderIsUsedEmRKNS_10LayerIndexE"] = function () {
    return (__ZNK4cura16SliceMeshStorage17getExtruderIsUsedEmRKNS_10LayerIndexE = Module["__ZNK4cura16SliceMeshStorage17getExtruderIsUsedEmRKNS_10LayerIndexE"] = Module["asm"]["$d"]).apply(null, arguments)
};
var __ZNK4cura16SliceMeshStorage9isPrintedEv = Module["__ZNK4cura16SliceMeshStorage9isPrintedEv"] = function () {
    return (__ZNK4cura16SliceMeshStorage9isPrintedEv = Module["__ZNK4cura16SliceMeshStorage9isPrintedEv"] = Module["asm"]["ae"]).apply(null, arguments)
};
var __ZNK4cura16SliceDataStorage27getExtruderPrimeBlobEnabledEm = Module["__ZNK4cura16SliceDataStorage27getExtruderPrimeBlobEnabledEm"] = function () {
    return (__ZNK4cura16SliceDataStorage27getExtruderPrimeBlobEnabledEm = Module["__ZNK4cura16SliceDataStorage27getExtruderPrimeBlobEnabledEm"] = Module["asm"]["be"]).apply(null, arguments)
};
var __ZN4cura12SupportLayer34excludeAreasFromSupportInfillAreasERKNS_8PolygonsERKNS_4AABBE = Module["__ZN4cura12SupportLayer34excludeAreasFromSupportInfillAreasERKNS_8PolygonsERKNS_4AABBE"] = function () {
    return (__ZN4cura12SupportLayer34excludeAreasFromSupportInfillAreasERKNS_8PolygonsERKNS_4AABBE = Module["__ZN4cura12SupportLayer34excludeAreasFromSupportInfillAreasERKNS_8PolygonsERKNS_4AABBE"] = Module["asm"]["ce"]).apply(null, arguments)
};
var __ZN4cura11SlicerLayer21makeBasicPolygonLoopsERNS_8PolygonsE = Module["__ZN4cura11SlicerLayer21makeBasicPolygonLoopsERNS_8PolygonsE"] = function () {
    return (__ZN4cura11SlicerLayer21makeBasicPolygonLoopsERNS_8PolygonsE = Module["__ZN4cura11SlicerLayer21makeBasicPolygonLoopsERNS_8PolygonsE"] = Module["asm"]["de"]).apply(null, arguments)
};
var __ZN4cura11SlicerLayer20makeBasicPolygonLoopERNS_8PolygonsEj = Module["__ZN4cura11SlicerLayer20makeBasicPolygonLoopERNS_8PolygonsEj"] = function () {
    return (__ZN4cura11SlicerLayer20makeBasicPolygonLoopERNS_8PolygonsEj = Module["__ZN4cura11SlicerLayer20makeBasicPolygonLoopERNS_8PolygonsEj"] = Module["asm"]["ee"]).apply(null, arguments)
};
var __ZNK4cura11SlicerLayer21tryFaceNextSegmentIdxERKNS_13SlicerSegmentEij = Module["__ZNK4cura11SlicerLayer21tryFaceNextSegmentIdxERKNS_13SlicerSegmentEij"] = function () {
    return (__ZNK4cura11SlicerLayer21tryFaceNextSegmentIdxERKNS_13SlicerSegmentEij = Module["__ZNK4cura11SlicerLayer21tryFaceNextSegmentIdxERKNS_13SlicerSegmentEij"] = Module["asm"]["fe"]).apply(null, arguments)
};
var __ZN4cura11SlicerLayer17getNextSegmentIdxERKNS_13SlicerSegmentEj = Module["__ZN4cura11SlicerLayer17getNextSegmentIdxERKNS_13SlicerSegmentEj"] = function () {
    return (__ZN4cura11SlicerLayer17getNextSegmentIdxERKNS_13SlicerSegmentEj = Module["__ZN4cura11SlicerLayer17getNextSegmentIdxERKNS_13SlicerSegmentEj"] = Module["asm"]["ge"]).apply(null, arguments)
};
var __ZN4cura11SlicerLayer20connectOpenPolylinesERNS_8PolygonsE = Module["__ZN4cura11SlicerLayer20connectOpenPolylinesERNS_8PolygonsE"] = function () {
    return (__ZN4cura11SlicerLayer20connectOpenPolylinesERNS_8PolygonsE = Module["__ZN4cura11SlicerLayer20connectOpenPolylinesERNS_8PolygonsE"] = Module["asm"]["he"]).apply(null, arguments)
};
var __ZN4cura11SlicerLayer24connectOpenPolylinesImplERNS_8PolygonsExxb = Module["__ZN4cura11SlicerLayer24connectOpenPolylinesImplERNS_8PolygonsExxb"] = function () {
    return (__ZN4cura11SlicerLayer24connectOpenPolylinesImplERNS_8PolygonsExxb = Module["__ZN4cura11SlicerLayer24connectOpenPolylinesImplERNS_8PolygonsExxb"] = Module["asm"]["ie"]).apply(null, arguments)
};
var __ZNK4cura11SlicerLayer18planPolylineStitchERKNS_8PolygonsERNS0_8TerminusES5_Pb = Module["__ZNK4cura11SlicerLayer18planPolylineStitchERKNS_8PolygonsERNS0_8TerminusES5_Pb"] = function () {
    return (__ZNK4cura11SlicerLayer18planPolylineStitchERKNS_8PolygonsERNS0_8TerminusES5_Pb = Module["__ZNK4cura11SlicerLayer18planPolylineStitchERKNS_8PolygonsERNS0_8TerminusES5_Pb"] = Module["asm"]["je"]).apply(null, arguments)
};
var __ZNK4cura11SlicerLayer13joinPolylinesERNS_10PolygonRefES2_PKb = Module["__ZNK4cura11SlicerLayer13joinPolylinesERNS_10PolygonRefES2_PKb"] = function () {
    return (__ZNK4cura11SlicerLayer13joinPolylinesERNS_10PolygonRefES2_PKb = Module["__ZNK4cura11SlicerLayer13joinPolylinesERNS_10PolygonRefES2_PKb"] = Module["asm"]["ke"]).apply(null, arguments)
};
var __ZN4cura11SlicerLayer6stitchERNS_8PolygonsE = Module["__ZN4cura11SlicerLayer6stitchERNS_8PolygonsE"] = function () {
    return (__ZN4cura11SlicerLayer6stitchERNS_8PolygonsE = Module["__ZN4cura11SlicerLayer6stitchERNS_8PolygonsE"] = Module["asm"]["le"]).apply(null, arguments)
};
var __ZN4cura11SlicerLayer19TerminusTrackingMap9updateMapEmPKNS0_8TerminusES4_mS4_ = Module["__ZN4cura11SlicerLayer19TerminusTrackingMap9updateMapEmPKNS0_8TerminusES4_mS4_"] = function () {
    return (__ZN4cura11SlicerLayer19TerminusTrackingMap9updateMapEmPKNS0_8TerminusES4_mS4_ = Module["__ZN4cura11SlicerLayer19TerminusTrackingMap9updateMapEmPKNS0_8TerminusES4_mS4_"] = Module["asm"]["me"]).apply(null, arguments)
};
var __ZN4cura11SlicerLayer16stitch_extensiveERNS_8PolygonsE = Module["__ZN4cura11SlicerLayer16stitch_extensiveERNS_8PolygonsE"] = function () {
    return (__ZN4cura11SlicerLayer16stitch_extensiveERNS_8PolygonsE = Module["__ZN4cura11SlicerLayer16stitch_extensiveERNS_8PolygonsE"] = Module["asm"]["ne"]).apply(null, arguments)
};
var __ZN4cura11SlicerLayer12makePolygonsEPKNS_4MeshEb = Module["__ZN4cura11SlicerLayer12makePolygonsEPKNS_4MeshEb"] = function () {
    return (__ZN4cura11SlicerLayer12makePolygonsEPKNS_4MeshEb = Module["__ZN4cura11SlicerLayer12makePolygonsEPKNS_4MeshEb"] = Module["asm"]["oe"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator19setFirmwareDefaultsERKNS_8SettingsE = Module["__ZN4cura22TimeEstimateCalculator19setFirmwareDefaultsERKNS_8SettingsE"] = function () {
    return (__ZN4cura22TimeEstimateCalculator19setFirmwareDefaultsERKNS_8SettingsE = Module["__ZN4cura22TimeEstimateCalculator19setFirmwareDefaultsERKNS_8SettingsE"] = Module["asm"]["pe"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator11setPositionENS0_8PositionE = Module["__ZN4cura22TimeEstimateCalculator11setPositionENS0_8PositionE"] = function () {
    return (__ZN4cura22TimeEstimateCalculator11setPositionENS0_8PositionE = Module["__ZN4cura22TimeEstimateCalculator11setPositionENS0_8PositionE"] = Module["asm"]["qe"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator7addTimeERKNS_8DurationE = Module["__ZN4cura22TimeEstimateCalculator7addTimeERKNS_8DurationE"] = function () {
    return (__ZN4cura22TimeEstimateCalculator7addTimeERKNS_8DurationE = Module["__ZN4cura22TimeEstimateCalculator7addTimeERKNS_8DurationE"] = Module["asm"]["re"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator15setAccelerationERKNS_8VelocityE = Module["__ZN4cura22TimeEstimateCalculator15setAccelerationERKNS_8VelocityE"] = function () {
    return (__ZN4cura22TimeEstimateCalculator15setAccelerationERKNS_8VelocityE = Module["__ZN4cura22TimeEstimateCalculator15setAccelerationERKNS_8VelocityE"] = Module["asm"]["se"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator12setMaxXyJerkERKNS_8VelocityE = Module["__ZN4cura22TimeEstimateCalculator12setMaxXyJerkERKNS_8VelocityE"] = function () {
    return (__ZN4cura22TimeEstimateCalculator12setMaxXyJerkERKNS_8VelocityE = Module["__ZN4cura22TimeEstimateCalculator12setMaxXyJerkERKNS_8VelocityE"] = Module["asm"]["te"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator15setMaxZFeedrateERKNS_8VelocityE = Module["__ZN4cura22TimeEstimateCalculator15setMaxZFeedrateERKNS_8VelocityE"] = function () {
    return (__ZN4cura22TimeEstimateCalculator15setMaxZFeedrateERKNS_8VelocityE = Module["__ZN4cura22TimeEstimateCalculator15setMaxZFeedrateERKNS_8VelocityE"] = Module["asm"]["ue"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator5resetEv = Module["__ZN4cura22TimeEstimateCalculator5resetEv"] = function () {
    return (__ZN4cura22TimeEstimateCalculator5resetEv = Module["__ZN4cura22TimeEstimateCalculator5resetEv"] = Module["asm"]["ve"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator29calculate_trapezoid_for_blockEPNS0_5BlockENS_5RatioES3_ = Module["__ZN4cura22TimeEstimateCalculator29calculate_trapezoid_for_blockEPNS0_5BlockENS_5RatioES3_"] = function () {
    return (__ZN4cura22TimeEstimateCalculator29calculate_trapezoid_for_blockEPNS0_5BlockENS_5RatioES3_ = Module["__ZN4cura22TimeEstimateCalculator29calculate_trapezoid_for_blockEPNS0_5BlockENS_5RatioES3_"] = Module["asm"]["we"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator4planENS0_8PositionENS_8VelocityENS_16PrintFeatureTypeE = Module["__ZN4cura22TimeEstimateCalculator4planENS0_8PositionENS_8VelocityENS_16PrintFeatureTypeE"] = function () {
    return (__ZN4cura22TimeEstimateCalculator4planENS0_8PositionENS_8VelocityENS_16PrintFeatureTypeE = Module["__ZN4cura22TimeEstimateCalculator4planENS0_8PositionENS_8VelocityENS_16PrintFeatureTypeE"] = Module["asm"]["xe"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator22recalculate_trapezoidsEv = Module["__ZN4cura22TimeEstimateCalculator22recalculate_trapezoidsEv"] = function () {
    return (__ZN4cura22TimeEstimateCalculator22recalculate_trapezoidsEv = Module["__ZN4cura22TimeEstimateCalculator22recalculate_trapezoidsEv"] = Module["asm"]["ye"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator12reverse_passEv = Module["__ZN4cura22TimeEstimateCalculator12reverse_passEv"] = function () {
    return (__ZN4cura22TimeEstimateCalculator12reverse_passEv = Module["__ZN4cura22TimeEstimateCalculator12reverse_passEv"] = Module["asm"]["ze"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator12forward_passEv = Module["__ZN4cura22TimeEstimateCalculator12forward_passEv"] = function () {
    return (__ZN4cura22TimeEstimateCalculator12forward_passEv = Module["__ZN4cura22TimeEstimateCalculator12forward_passEv"] = Module["asm"]["Ae"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator27planner_reverse_pass_kernelEPNS0_5BlockES2_S2_ = Module["__ZN4cura22TimeEstimateCalculator27planner_reverse_pass_kernelEPNS0_5BlockES2_S2_"] = function () {
    return (__ZN4cura22TimeEstimateCalculator27planner_reverse_pass_kernelEPNS0_5BlockES2_S2_ = Module["__ZN4cura22TimeEstimateCalculator27planner_reverse_pass_kernelEPNS0_5BlockES2_S2_"] = Module["asm"]["Be"]).apply(null, arguments)
};
var __ZN4cura22TimeEstimateCalculator27planner_forward_pass_kernelEPNS0_5BlockES2_S2_ = Module["__ZN4cura22TimeEstimateCalculator27planner_forward_pass_kernelEPNS0_5BlockES2_S2_"] = function () {
    return (__ZN4cura22TimeEstimateCalculator27planner_forward_pass_kernelEPNS0_5BlockES2_S2_ = Module["__ZN4cura22TimeEstimateCalculator27planner_forward_pass_kernelEPNS0_5BlockES2_S2_"] = Module["asm"]["Ce"]).apply(null, arguments)
};
var __ZN4cura10TopSurface30setAreasFromMeshAndLayerNumberERNS_16SliceMeshStorageEm = Module["__ZN4cura10TopSurface30setAreasFromMeshAndLayerNumberERNS_16SliceMeshStorageEm"] = function () {
    return (__ZN4cura10TopSurface30setAreasFromMeshAndLayerNumberERNS_16SliceMeshStorageEm = Module["__ZN4cura10TopSurface30setAreasFromMeshAndLayerNumberERNS_16SliceMeshStorageEm"] = Module["asm"]["De"]).apply(null, arguments)
};
var __ZNK4cura10TopSurface7ironingERKNS_16SliceMeshStorageERKNS_15GCodePathConfigERNS_9LayerPlanE = Module["__ZNK4cura10TopSurface7ironingERKNS_16SliceMeshStorageERKNS_15GCodePathConfigERNS_9LayerPlanE"] = function () {
    return (__ZNK4cura10TopSurface7ironingERKNS_16SliceMeshStorageERKNS_15GCodePathConfigERNS_9LayerPlanE = Module["__ZNK4cura10TopSurface7ironingERKNS_16SliceMeshStorageERKNS_15GCodePathConfigERNS_9LayerPlanE"] = Module["asm"]["Ee"]).apply(null, arguments)
};
var __ZN4cura11TreeSupport20generateSupportAreasERNS_16SliceDataStorageE = Module["__ZN4cura11TreeSupport20generateSupportAreasERNS_16SliceDataStorageE"] = function () {
    return (__ZN4cura11TreeSupport20generateSupportAreasERNS_16SliceDataStorageE = Module["__ZN4cura11TreeSupport20generateSupportAreasERNS_16SliceDataStorageE"] = Module["asm"]["Fe"]).apply(null, arguments)
};
var __ZN4cura11TreeSupport21generateContactPointsERKNS_16SliceMeshStorageERNSt3__26vectorINS4_13unordered_setIPNS0_4NodeENS4_4hashIS8_EENS4_8equal_toIS8_EENS4_9allocatorIS8_EEEENSD_ISF_EEEE = Module["__ZN4cura11TreeSupport21generateContactPointsERKNS_16SliceMeshStorageERNSt3__26vectorINS4_13unordered_setIPNS0_4NodeENS4_4hashIS8_EENS4_8equal_toIS8_EENS4_9allocatorIS8_EEEENSD_ISF_EEEE"] = function () {
    return (__ZN4cura11TreeSupport21generateContactPointsERKNS_16SliceMeshStorageERNSt3__26vectorINS4_13unordered_setIPNS0_4NodeENS4_4hashIS8_EENS4_8equal_toIS8_EENS4_9allocatorIS8_EEEENSD_ISF_EEEE = Module["__ZN4cura11TreeSupport21generateContactPointsERKNS_16SliceMeshStorageERNSt3__26vectorINS4_13unordered_setIPNS0_4NodeENS4_4hashIS8_EENS4_8equal_toIS8_EENS4_9allocatorIS8_EEEENSD_ISF_EEEE"] = Module["asm"]["Ge"]).apply(null, arguments)
};
var __ZN4cura11TreeSupport9dropNodesERNSt3__26vectorINS1_13unordered_setIPNS0_4NodeENS1_4hashIS5_EENS1_8equal_toIS5_EENS1_9allocatorIS5_EEEENSA_ISC_EEEE = Module["__ZN4cura11TreeSupport9dropNodesERNSt3__26vectorINS1_13unordered_setIPNS0_4NodeENS1_4hashIS5_EENS1_8equal_toIS5_EENS1_9allocatorIS5_EEEENSA_ISC_EEEE"] = function () {
    return (__ZN4cura11TreeSupport9dropNodesERNSt3__26vectorINS1_13unordered_setIPNS0_4NodeENS1_4hashIS5_EENS1_8equal_toIS5_EENS1_9allocatorIS5_EEEENSA_ISC_EEEE = Module["__ZN4cura11TreeSupport9dropNodesERNSt3__26vectorINS1_13unordered_setIPNS0_4NodeENS1_4hashIS5_EENS1_8equal_toIS5_EENS1_9allocatorIS5_EEEENSA_ISC_EEEE"] = Module["asm"]["He"]).apply(null, arguments)
};
var __ZN4cura11TreeSupport11drawCirclesERNS_16SliceDataStorageERKNSt3__26vectorINS3_13unordered_setIPNS0_4NodeENS3_4hashIS7_EENS3_8equal_toIS7_EENS3_9allocatorIS7_EEEENSC_ISE_EEEE = Module["__ZN4cura11TreeSupport11drawCirclesERNS_16SliceDataStorageERKNSt3__26vectorINS3_13unordered_setIPNS0_4NodeENS3_4hashIS7_EENS3_8equal_toIS7_EENS3_9allocatorIS7_EEEENSC_ISE_EEEE"] = function () {
    return (__ZN4cura11TreeSupport11drawCirclesERNS_16SliceDataStorageERKNSt3__26vectorINS3_13unordered_setIPNS0_4NodeENS3_4hashIS7_EENS3_8equal_toIS7_EENS3_9allocatorIS7_EEEENSC_ISE_EEEE = Module["__ZN4cura11TreeSupport11drawCirclesERNS_16SliceDataStorageERKNSt3__26vectorINS3_13unordered_setIPNS0_4NodeENS3_4hashIS7_EENS3_8equal_toIS7_EENS3_9allocatorIS7_EEEENSC_ISE_EEEE"] = Module["asm"]["Ie"]).apply(null, arguments)
};
var __ZN4cura11TreeSupport17insertDroppedNodeERNSt3__213unordered_setIPNS0_4NodeENS1_4hashIS4_EENS1_8equal_toIS4_EENS1_9allocatorIS4_EEEES4_ = Module["__ZN4cura11TreeSupport17insertDroppedNodeERNSt3__213unordered_setIPNS0_4NodeENS1_4hashIS4_EENS1_8equal_toIS4_EENS1_9allocatorIS4_EEEES4_"] = function () {
    return (__ZN4cura11TreeSupport17insertDroppedNodeERNSt3__213unordered_setIPNS0_4NodeENS1_4hashIS4_EENS1_8equal_toIS4_EENS1_9allocatorIS4_EEEES4_ = Module["__ZN4cura11TreeSupport17insertDroppedNodeERNSt3__213unordered_setIPNS0_4NodeENS1_4hashIS4_EENS1_8equal_toIS4_EENS1_9allocatorIS4_EEEES4_"] = Module["asm"]["Je"]).apply(null, arguments)
};
var __ZN4cura16WallsComputation14generateInsetsEPNS_14SliceLayerPartE = Module["__ZN4cura16WallsComputation14generateInsetsEPNS_14SliceLayerPartE"] = function () {
    return (__ZN4cura16WallsComputation14generateInsetsEPNS_14SliceLayerPartE = Module["__ZN4cura16WallsComputation14generateInsetsEPNS_14SliceLayerPartE"] = Module["asm"]["Ke"]).apply(null, arguments)
};
var __ZN4cura16WallsComputation14generateInsetsEPNS_10SliceLayerE = Module["__ZN4cura16WallsComputation14generateInsetsEPNS_10SliceLayerE"] = function () {
    return (__ZN4cura16WallsComputation14generateInsetsEPNS_10SliceLayerE = Module["__ZN4cura16WallsComputation14generateInsetsEPNS_10SliceLayerE"] = Module["asm"]["Le"]).apply(null, arguments)
};
var __ZN4cura22WallOverlapComputation11getIsPassedERKNS_18ProximityPointLinkES3_ = Module["__ZN4cura22WallOverlapComputation11getIsPassedERKNS_18ProximityPointLinkES3_"] = function () {
    return (__ZN4cura22WallOverlapComputation11getIsPassedERKNS_18ProximityPointLinkES3_ = Module["__ZN4cura22WallOverlapComputation11getIsPassedERKNS_18ProximityPointLinkES3_"] = Module["asm"]["Me"]).apply(null, arguments)
};
var __ZN4cura22WallOverlapComputation11setIsPassedERKNS_18ProximityPointLinkES3_ = Module["__ZN4cura22WallOverlapComputation11setIsPassedERKNS_18ProximityPointLinkES3_"] = function () {
    return (__ZN4cura22WallOverlapComputation11setIsPassedERKNS_18ProximityPointLinkES3_ = Module["__ZN4cura22WallOverlapComputation11setIsPassedERKNS_18ProximityPointLinkES3_"] = Module["asm"]["Ne"]).apply(null, arguments)
};
var __ZN4cura6Weaver5weaveEPNS_9MeshGroupE = Module["__ZN4cura6Weaver5weaveEPNS_9MeshGroupE"] = function () {
    return (__ZN4cura6Weaver5weaveEPNS_9MeshGroupE = Module["__ZN4cura6Weaver5weaveEPNS_9MeshGroupE"] = Module["asm"]["Oe"]).apply(null, arguments)
};
var __ZN4cura6Weaver17chainify_polygonsERNS_8PolygonsEN10ClipperLib8IntPointES2_ = Module["__ZN4cura6Weaver17chainify_polygonsERNS_8PolygonsEN10ClipperLib8IntPointES2_"] = function () {
    return (__ZN4cura6Weaver17chainify_polygonsERNS_8PolygonsEN10ClipperLib8IntPointES2_ = Module["__ZN4cura6Weaver17chainify_polygonsERNS_8PolygonsEN10ClipperLib8IntPointES2_"] = Module["asm"]["Pe"]).apply(null, arguments)
};
var __ZN4cura6Weaver20createHorizontalFillERNS_10WeaveLayerERNS_8PolygonsE = Module["__ZN4cura6Weaver20createHorizontalFillERNS_10WeaveLayerERNS_8PolygonsE"] = function () {
    return (__ZN4cura6Weaver20createHorizontalFillERNS_10WeaveLayerERNS_8PolygonsE = Module["__ZN4cura6Weaver20createHorizontalFillERNS_10WeaveLayerERNS_8PolygonsE"] = Module["asm"]["Qe"]).apply(null, arguments)
};
var __ZN4cura6Weaver16connect_polygonsERNS_8PolygonsEiS2_iRNS_15WeaveConnectionE = Module["__ZN4cura6Weaver16connect_polygonsERNS_8PolygonsEiS2_iRNS_15WeaveConnectionE"] = function () {
    return (__ZN4cura6Weaver16connect_polygonsERNS_8PolygonsEiS2_iRNS_15WeaveConnectionE = Module["__ZN4cura6Weaver16connect_polygonsERNS_8PolygonsEiS2_iRNS_15WeaveConnectionE"] = Module["asm"]["Re"]).apply(null, arguments)
};
var __ZN4cura6Weaver9fillRoofsERNS_8PolygonsES2_iiRNS_9WeaveRoofE = Module["__ZN4cura6Weaver9fillRoofsERNS_8PolygonsES2_iiRNS_9WeaveRoofE"] = function () {
    return (__ZN4cura6Weaver9fillRoofsERNS_8PolygonsES2_iiRNS_9WeaveRoofE = Module["__ZN4cura6Weaver9fillRoofsERNS_8PolygonsES2_iiRNS_9WeaveRoofE"] = Module["asm"]["Se"]).apply(null, arguments)
};
var __ZN4cura6Weaver10fillFloorsERNS_8PolygonsES2_iiRNS_9WeaveRoofE = Module["__ZN4cura6Weaver10fillFloorsERNS_8PolygonsES2_iiRNS_9WeaveRoofE"] = function () {
    return (__ZN4cura6Weaver10fillFloorsERNS_8PolygonsES2_iiRNS_9WeaveRoofE = Module["__ZN4cura6Weaver10fillFloorsERNS_8PolygonsES2_iiRNS_9WeaveRoofE"] = Module["asm"]["Te"]).apply(null, arguments)
};
var __ZN4cura6Weaver17connections2movesERNS_13WeaveRoofPartE = Module["__ZN4cura6Weaver17connections2movesERNS_13WeaveRoofPartE"] = function () {
    return (__ZN4cura6Weaver17connections2movesERNS_13WeaveRoofPartE = Module["__ZN4cura6Weaver17connections2movesERNS_13WeaveRoofPartE"] = Module["asm"]["Ue"]).apply(null, arguments)
};
var __ZN4cura6Weaver7connectERNS_8PolygonsEiS2_iRNS_15WeaveConnectionE = Module["__ZN4cura6Weaver7connectERNS_8PolygonsEiS2_iRNS_15WeaveConnectionE"] = function () {
    return (__ZN4cura6Weaver7connectERNS_8PolygonsEiS2_iRNS_15WeaveConnectionE = Module["__ZN4cura6Weaver7connectERNS_8PolygonsEiS2_iRNS_15WeaveConnectionE"] = Module["asm"]["Ve"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode10writeGCodeEv = Module["__ZN4cura15Wireframe2gcode10writeGCodeEv"] = function () {
    return (__ZN4cura15Wireframe2gcode10writeGCodeEv = Module["__ZN4cura15Wireframe2gcode10writeGCodeEv"] = Module["asm"]["We"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode19processStartingCodeEv = Module["__ZN4cura15Wireframe2gcode19processStartingCodeEv"] = function () {
    return (__ZN4cura15Wireframe2gcode19processStartingCodeEv = Module["__ZN4cura15Wireframe2gcode19processStartingCodeEv"] = Module["asm"]["Xe"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode12processSkirtEv = Module["__ZN4cura15Wireframe2gcode12processSkirtEv"] = function () {
    return (__ZN4cura15Wireframe2gcode12processSkirtEv = Module["__ZN4cura15Wireframe2gcode12processSkirtEv"] = Module["asm"]["Ye"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode9writeFillERNSt3__26vectorINS_13WeaveRoofPartENS1_9allocatorIS3_EEEERNS_8PolygonsENS1_8functionIFvRS0_RNS_19WeaveConnectionPartEjEEENSA_IFvSB_RNS_22WeaveConnectionSegmentEEEE = Module["__ZN4cura15Wireframe2gcode9writeFillERNSt3__26vectorINS_13WeaveRoofPartENS1_9allocatorIS3_EEEERNS_8PolygonsENS1_8functionIFvRS0_RNS_19WeaveConnectionPartEjEEENSA_IFvSB_RNS_22WeaveConnectionSegmentEEEE"] = function () {
    return (__ZN4cura15Wireframe2gcode9writeFillERNSt3__26vectorINS_13WeaveRoofPartENS1_9allocatorIS3_EEEERNS_8PolygonsENS1_8functionIFvRS0_RNS_19WeaveConnectionPartEjEEENSA_IFvSB_RNS_22WeaveConnectionSegmentEEEE = Module["__ZN4cura15Wireframe2gcode9writeFillERNSt3__26vectorINS_13WeaveRoofPartENS1_9allocatorIS3_EEEERNS_8PolygonsENS1_8functionIFvRS0_RNS_19WeaveConnectionPartEjEEENSA_IFvSB_RNS_22WeaveConnectionSegmentEEEE"] = Module["asm"]["Ze"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode14handle_segmentERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode14handle_segmentERNS_19WeaveConnectionPartEj"] = function () {
    return (__ZN4cura15Wireframe2gcode14handle_segmentERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode14handle_segmentERNS_19WeaveConnectionPartEj"] = Module["asm"]["_e"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode19handle_roof_segmentERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode19handle_roof_segmentERNS_19WeaveConnectionPartEj"] = function () {
    return (__ZN4cura15Wireframe2gcode19handle_roof_segmentERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode19handle_roof_segmentERNS_19WeaveConnectionPartEj"] = Module["asm"]["$e"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode8finalizeEv = Module["__ZN4cura15Wireframe2gcode8finalizeEv"] = function () {
    return (__ZN4cura15Wireframe2gcode8finalizeEv = Module["__ZN4cura15Wireframe2gcode8finalizeEv"] = Module["asm"]["af"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode20writeMoveWithRetractEN10ClipperLib8IntPointE = Module["__ZN4cura15Wireframe2gcode20writeMoveWithRetractEN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura15Wireframe2gcode20writeMoveWithRetractEN10ClipperLib8IntPointE = Module["__ZN4cura15Wireframe2gcode20writeMoveWithRetractEN10ClipperLib8IntPointE"] = Module["asm"]["bf"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode20writeMoveWithRetractENS_6Point3E = Module["__ZN4cura15Wireframe2gcode20writeMoveWithRetractENS_6Point3E"] = function () {
    return (__ZN4cura15Wireframe2gcode20writeMoveWithRetractENS_6Point3E = Module["__ZN4cura15Wireframe2gcode20writeMoveWithRetractENS_6Point3E"] = Module["asm"]["cf"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode7go_downERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode7go_downERNS_19WeaveConnectionPartEj"] = function () {
    return (__ZN4cura15Wireframe2gcode7go_downERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode7go_downERNS_19WeaveConnectionPartEj"] = Module["asm"]["df"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode13strategy_knotERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode13strategy_knotERNS_19WeaveConnectionPartEj"] = function () {
    return (__ZN4cura15Wireframe2gcode13strategy_knotERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode13strategy_knotERNS_19WeaveConnectionPartEj"] = Module["asm"]["ef"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode16strategy_retractERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode16strategy_retractERNS_19WeaveConnectionPartEj"] = function () {
    return (__ZN4cura15Wireframe2gcode16strategy_retractERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode16strategy_retractERNS_19WeaveConnectionPartEj"] = Module["asm"]["ff"]).apply(null, arguments)
};
var __ZN4cura15Wireframe2gcode19strategy_compensateERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode19strategy_compensateERNS_19WeaveConnectionPartEj"] = function () {
    return (__ZN4cura15Wireframe2gcode19strategy_compensateERNS_19WeaveConnectionPartEj = Module["__ZN4cura15Wireframe2gcode19strategy_compensateERNS_19WeaveConnectionPartEj"] = Module["asm"]["gf"]).apply(null, arguments)
};
var __ZN4cura10logWarningEPKcz = Module["__ZN4cura10logWarningEPKcz"] = function () {
    return (__ZN4cura10logWarningEPKcz = Module["__ZN4cura10logWarningEPKcz"] = Module["asm"]["hf"]).apply(null, arguments)
};
var __ZN4cura6AABB3D7includeENS_6Point3E = Module["__ZN4cura6AABB3D7includeENS_6Point3E"] = function () {
    return (__ZN4cura6AABB3D7includeENS_6Point3E = Module["__ZN4cura6AABB3D7includeENS_6Point3E"] = Module["asm"]["jf"]).apply(null, arguments)
};
var __ZN4cura6AABB3D8includeZEx = Module["__ZN4cura6AABB3D8includeZEx"] = function () {
    return (__ZN4cura6AABB3D8includeZEx = Module["__ZN4cura6AABB3D8includeZEx"] = Module["asm"]["kf"]).apply(null, arguments)
};
var __ZN4cura8logDebugEPKcz = Module["__ZN4cura8logDebugEPKcz"] = function () {
    return (__ZN4cura8logDebugEPKcz = Module["__ZN4cura8logDebugEPKcz"] = Module["asm"]["lf"]).apply(null, arguments)
};
var __ZN4cura6AABB3D8expandXYEi = Module["__ZN4cura6AABB3D8expandXYEi"] = function () {
    return (__ZN4cura6AABB3D8expandXYEi = Module["__ZN4cura6AABB3D8expandXYEi"] = Module["asm"]["mf"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils10spreadDotsENS_18PolygonsPointIndexES1_jRNSt3__26vectorINS_19ClosestPolygonPointENS2_9allocatorIS4_EEEE = Module["__ZN4cura12PolygonUtils10spreadDotsENS_18PolygonsPointIndexES1_jRNSt3__26vectorINS_19ClosestPolygonPointENS2_9allocatorIS4_EEEE"] = function () {
    return (__ZN4cura12PolygonUtils10spreadDotsENS_18PolygonsPointIndexES1_jRNSt3__26vectorINS_19ClosestPolygonPointENS2_9allocatorIS4_EEEE = Module["__ZN4cura12PolygonUtils10spreadDotsENS_18PolygonsPointIndexES1_jRNSt3__26vectorINS_19ClosestPolygonPointENS2_9allocatorIS4_EEEE"] = Module["asm"]["nf"]).apply(null, arguments)
};
var __ZN4cura4Comb4calcERKNS_13ExtruderTrainEN10ClipperLib8IntPointES5_RNS_9CombPathsEbbx = Module["__ZN4cura4Comb4calcERKNS_13ExtruderTrainEN10ClipperLib8IntPointES5_RNS_9CombPathsEbbx"] = function () {
    return (__ZN4cura4Comb4calcERKNS_13ExtruderTrainEN10ClipperLib8IntPointES5_RNS_9CombPathsEbbx = Module["__ZN4cura4Comb4calcERKNS_13ExtruderTrainEN10ClipperLib8IntPointES5_RNS_9CombPathsEbbx"] = Module["asm"]["of"]).apply(null, arguments)
};
var __ZNK4cura8Polygons6insideEN10ClipperLib8IntPointEb = Module["__ZNK4cura8Polygons6insideEN10ClipperLib8IntPointEb"] = function () {
    return (__ZNK4cura8Polygons6insideEN10ClipperLib8IntPointEb = Module["__ZNK4cura8Polygons6insideEN10ClipperLib8IntPointEb"] = Module["asm"]["pf"]).apply(null, arguments)
};
var __ZN4cura9GCodePath11setFanSpeedEd = Module["__ZN4cura9GCodePath11setFanSpeedEd"] = function () {
    return (__ZN4cura9GCodePath11setFanSpeedEd = Module["__ZN4cura9GCodePath11setFanSpeedEd"] = Module["asm"]["qf"]).apply(null, arguments)
};
var __ZN4cura22PolygonProximityLinker8isLinkedEN10ClipperLib8IntPointE = Module["__ZN4cura22PolygonProximityLinker8isLinkedEN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura22PolygonProximityLinker8isLinkedEN10ClipperLib8IntPointE = Module["__ZN4cura22PolygonProximityLinker8isLinkedEN10ClipperLib8IntPointE"] = Module["asm"]["rf"]).apply(null, arguments)
};
var __ZNK4cura18ProximityPointLinkeqERKS0_ = Module["__ZNK4cura18ProximityPointLinkeqERKS0_"] = function () {
    return (__ZNK4cura18ProximityPointLinkeqERKS0_ = Module["__ZNK4cura18ProximityPointLinkeqERKS0_"] = Module["asm"]["sf"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentERKNS_8PolygonsERKN10ClipperLib8IntPointES7_ = Module["__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentERKNS_8PolygonsERKN10ClipperLib8IntPointES7_"] = function () {
    return (__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentERKNS_8PolygonsERKN10ClipperLib8IntPointES7_ = Module["__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentERKNS_8PolygonsERKN10ClipperLib8IntPointES7_"] = Module["asm"]["tf"]).apply(null, arguments)
};
var __ZN4cura21LinePolygonsCrossings19generateCombingPathERNS_8CombPathExb = Module["__ZN4cura21LinePolygonsCrossings19generateCombingPathERNS_8CombPathExb"] = function () {
    return (__ZN4cura21LinePolygonsCrossings19generateCombingPathERNS_8CombPathExb = Module["__ZN4cura21LinePolygonsCrossings19generateCombingPathERNS_8CombPathExb"] = Module["asm"]["uf"]).apply(null, arguments)
};
var __ZN4cura11LinearAlg2D12getAngleLeftERKN10ClipperLib8IntPointES4_S4_ = Module["__ZN4cura11LinearAlg2D12getAngleLeftERKN10ClipperLib8IntPointES4_S4_"] = function () {
    return (__ZN4cura11LinearAlg2D12getAngleLeftERKN10ClipperLib8IntPointES4_S4_ = Module["__ZN4cura11LinearAlg2D12getAngleLeftERKN10ClipperLib8IntPointES4_S4_"] = Module["asm"]["vf"]).apply(null, arguments)
};
var __ZN4cura10PolygonRef8simplifyEii = Module["__ZN4cura10PolygonRef8simplifyEii"] = function () {
    return (__ZN4cura10PolygonRef8simplifyEii = Module["__ZN4cura10PolygonRef8simplifyEii"] = Module["asm"]["wf"]).apply(null, arguments)
};
var __ZNK4cura9GCodePath12isTravelPathEv = Module["__ZNK4cura9GCodePath12isTravelPathEv"] = function () {
    return (__ZNK4cura9GCodePath12isTravelPathEv = Module["__ZNK4cura9GCodePath12isTravelPathEv"] = Module["asm"]["xf"]).apply(null, arguments)
};
var __ZN4cura16NozzleTempInsert5writeERNS_11GCodeExportE = Module["__ZN4cura16NozzleTempInsert5writeERNS_11GCodeExportE"] = function () {
    return (__ZN4cura16NozzleTempInsert5writeERNS_11GCodeExportE = Module["__ZN4cura16NozzleTempInsert5writeERNS_11GCodeExportE"] = Module["asm"]["yf"]).apply(null, arguments)
};
var __ZNK4cura9GCodePath11getFanSpeedEv = Module["__ZNK4cura9GCodePath11getFanSpeedEv"] = function () {
    return (__ZNK4cura9GCodePath11getFanSpeedEv = Module["__ZNK4cura9GCodePath11getFanSpeedEv"] = Module["asm"]["zf"]).apply(null, arguments)
};
var __ZNK4cura9GCodePath20getExtrusionMM3perMMEv = Module["__ZNK4cura9GCodePath20getExtrusionMM3perMMEv"] = function () {
    return (__ZNK4cura9GCodePath20getExtrusionMM3perMMEv = Module["__ZNK4cura9GCodePath20getExtrusionMM3perMMEv"] = Module["asm"]["Af"]).apply(null, arguments)
};
var __ZNK4cura4AABB3hitERKS0_ = Module["__ZNK4cura4AABB3hitERKS0_"] = function () {
    return (__ZNK4cura4AABB3hitERKS0_ = Module["__ZNK4cura4AABB3hitERKS0_"] = Module["asm"]["Bf"]).apply(null, arguments)
};
var __ZNK4cura8Polygons4areaEv = Module["__ZNK4cura8Polygons4areaEv"] = function () {
    return (__ZNK4cura8Polygons4areaEv = Module["__ZNK4cura8Polygons4areaEv"] = Module["asm"]["Cf"]).apply(null, arguments)
};
var __ZN4cura6AABB3D7includeERKS0_ = Module["__ZN4cura6AABB3D7includeERKS0_"] = function () {
    return (__ZN4cura6AABB3D7includeERKS0_ = Module["__ZN4cura6AABB3D7includeERKS0_"] = Module["asm"]["Df"]).apply(null, arguments)
};
var __ZN4cura12GyroidInfill25generateTotalGyroidInfillERNS_8PolygonsEbxxxRKS1_x = Module["__ZN4cura12GyroidInfill25generateTotalGyroidInfillERNS_8PolygonsEbxxxRKS1_x"] = function () {
    return (__ZN4cura12GyroidInfill25generateTotalGyroidInfillERNS_8PolygonsEbxxxRKS1_x = Module["__ZN4cura12GyroidInfill25generateTotalGyroidInfillERNS_8PolygonsEbxxxRKS1_x"] = Module["asm"]["Ef"]).apply(null, arguments)
};
var __ZN4cura10SubDivCube24generateSubdivisionLinesExRNS_8PolygonsE = Module["__ZN4cura10SubDivCube24generateSubdivisionLinesExRNS_8PolygonsE"] = function () {
    return (__ZN4cura10SubDivCube24generateSubdivisionLinesExRNS_8PolygonsE = Module["__ZN4cura10SubDivCube24generateSubdivisionLinesExRNS_8PolygonsE"] = Module["asm"]["Ff"]).apply(null, arguments)
};
var __ZNK4cura13FlowTempGraph7getTempEdNS_11TemperatureEb = Module["__ZNK4cura13FlowTempGraph7getTempEdNS_11TemperatureEb"] = function () {
    return (__ZNK4cura13FlowTempGraph7getTempEdNS_11TemperatureEb = Module["__ZNK4cura13FlowTempGraph7getTempEdNS_11TemperatureEb"] = Module["asm"]["Gf"]).apply(null, arguments)
};
var __ZN4cura28SpaghettiInfillPathGenerator22processSpaghettiInfillERKNS_16SliceDataStorageERKNS_14FffGcodeWriterERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZN4cura28SpaghettiInfillPathGenerator22processSpaghettiInfillERKNS_16SliceDataStorageERKNS_14FffGcodeWriterERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = function () {
    return (__ZN4cura28SpaghettiInfillPathGenerator22processSpaghettiInfillERKNS_16SliceDataStorageERKNS_14FffGcodeWriterERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE = Module["__ZN4cura28SpaghettiInfillPathGenerator22processSpaghettiInfillERKNS_16SliceDataStorageERKNS_14FffGcodeWriterERNS_9LayerPlanERKNS_16SliceMeshStorageEmRKNS_17PathConfigStorage15MeshPathConfigsERKNS_14SliceLayerPartE"] = Module["asm"]["Hf"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils17polygonsIntersectERKNS_15ConstPolygonRefES3_ = Module["__ZN4cura12PolygonUtils17polygonsIntersectERKNS_15ConstPolygonRefES3_"] = function () {
    return (__ZN4cura12PolygonUtils17polygonsIntersectERKNS_15ConstPolygonRefES3_ = Module["__ZN4cura12PolygonUtils17polygonsIntersectERKNS_15ConstPolygonRefES3_"] = Module["asm"]["If"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils23polygonOutlinesAdjacentENS_15ConstPolygonRefES1_x = Module["__ZN4cura12PolygonUtils23polygonOutlinesAdjacentENS_15ConstPolygonRefES1_x"] = function () {
    return (__ZN4cura12PolygonUtils23polygonOutlinesAdjacentENS_15ConstPolygonRefES1_x = Module["__ZN4cura12PolygonUtils23polygonOutlinesAdjacentENS_15ConstPolygonRefES1_x"] = Module["asm"]["Jf"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils20findAdjacentPolygonsERNSt3__26vectorIjNS1_9allocatorIjEEEERKNS_15ConstPolygonRefERKNS2_INS_19ConstPolygonPointerENS3_ISA_EEEEx = Module["__ZN4cura12PolygonUtils20findAdjacentPolygonsERNSt3__26vectorIjNS1_9allocatorIjEEEERKNS_15ConstPolygonRefERKNS2_INS_19ConstPolygonPointerENS3_ISA_EEEEx"] = function () {
    return (__ZN4cura12PolygonUtils20findAdjacentPolygonsERNSt3__26vectorIjNS1_9allocatorIjEEEERKNS_15ConstPolygonRefERKNS2_INS_19ConstPolygonPointerENS3_ISA_EEEEx = Module["__ZN4cura12PolygonUtils20findAdjacentPolygonsERNSt3__26vectorIjNS1_9allocatorIjEEEERKNS_15ConstPolygonRefERKNS2_INS_19ConstPolygonPointerENS3_ISA_EEEEx"] = Module["asm"]["Kf"]).apply(null, arguments)
};
var __ZNK4cura18PolygonsPointIndex11initializedEv = Module["__ZNK4cura18PolygonsPointIndex11initializedEv"] = function () {
    return (__ZNK4cura18PolygonsPointIndex11initializedEv = Module["__ZNK4cura18PolygonsPointIndex11initializedEv"] = Module["asm"]["Lf"]).apply(null, arguments)
};
var __ZN4cura10TimeKeeper7restartEv = Module["__ZN4cura10TimeKeeper7restartEv"] = function () {
    return (__ZN4cura10TimeKeeper7restartEv = Module["__ZN4cura10TimeKeeper7restartEv"] = Module["asm"]["Mf"]).apply(null, arguments)
};
var __ZN4cura8Settings9setParentEPS0_ = Module["__ZN4cura8Settings9setParentEPS0_"] = function () {
    return (__ZN4cura8Settings9setParentEPS0_ = Module["__ZN4cura8Settings9setParentEPS0_"] = Module["asm"]["Nf"]).apply(null, arguments)
};
var __ZNK4cura6Point3eqERKS0_ = Module["__ZNK4cura6Point3eqERKS0_"] = function () {
    return (__ZNK4cura6Point3eqERKS0_ = Module["__ZNK4cura6Point3eqERKS0_"] = Module["asm"]["Of"]).apply(null, arguments)
};
var __ZN4cura6AABB3D6offsetENS_6Point3E = Module["__ZN4cura6AABB3D6offsetENS_6Point3E"] = function () {
    return (__ZN4cura6AABB3D6offsetENS_6Point3E = Module["__ZN4cura6AABB3D6offsetENS_6Point3E"] = Module["asm"]["Pf"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils24getNextPointWithDistanceEN10ClipperLib8IntPointExNS_15ConstPolygonRefEiiRNS_14GivenDistPointE = Module["__ZN4cura12PolygonUtils24getNextPointWithDistanceEN10ClipperLib8IntPointExNS_15ConstPolygonRefEiiRNS_14GivenDistPointE"] = function () {
    return (__ZN4cura12PolygonUtils24getNextPointWithDistanceEN10ClipperLib8IntPointExNS_15ConstPolygonRefEiiRNS_14GivenDistPointE = Module["__ZN4cura12PolygonUtils24getNextPointWithDistanceEN10ClipperLib8IntPointExNS_15ConstPolygonRefEiiRNS_14GivenDistPointE"] = Module["asm"]["Qf"]).apply(null, arguments)
};
var __ZN4cura20AdaptiveLayerHeights13getLayerCountEv = Module["__ZN4cura20AdaptiveLayerHeights13getLayerCountEv"] = function () {
    return (__ZN4cura20AdaptiveLayerHeights13getLayerCountEv = Module["__ZN4cura20AdaptiveLayerHeights13getLayerCountEv"] = Module["asm"]["Rf"]).apply(null, arguments)
};
var __ZNK4cura6AABB3D3hitERKS0_ = Module["__ZNK4cura6AABB3D3hitERKS0_"] = function () {
    return (__ZNK4cura6AABB3D3hitERKS0_ = Module["__ZNK4cura6AABB3D3hitERKS0_"] = Module["asm"]["Sf"]).apply(null, arguments)
};
var __ZN4cura4AABB9calculateERKNS_8PolygonsE = Module["__ZN4cura4AABB9calculateERKNS_8PolygonsE"] = function () {
    return (__ZN4cura4AABB9calculateERKNS_8PolygonsE = Module["__ZN4cura4AABB9calculateERKNS_8PolygonsE"] = Module["asm"]["Tf"]).apply(null, arguments)
};
var __ZNK4cura4AABB8containsERKN10ClipperLib8IntPointE = Module["__ZNK4cura4AABB8containsERKN10ClipperLib8IntPointE"] = function () {
    return (__ZNK4cura4AABB8containsERKN10ClipperLib8IntPointE = Module["__ZNK4cura4AABB8containsERKN10ClipperLib8IntPointE"] = Module["asm"]["Uf"]).apply(null, arguments)
};
var __ZN4cura4AABB6expandEi = Module["__ZN4cura4AABB6expandEi"] = function () {
    return (__ZN4cura4AABB6expandEi = Module["__ZN4cura4AABB6expandEi"] = Module["asm"]["Vf"]).apply(null, arguments)
};
var __ZNK4cura12PolygonsPart6insideEN10ClipperLib8IntPointEb = Module["__ZNK4cura12PolygonsPart6insideEN10ClipperLib8IntPointEb"] = function () {
    return (__ZNK4cura12PolygonsPart6insideEN10ClipperLib8IntPointEb = Module["__ZNK4cura12PolygonsPart6insideEN10ClipperLib8IntPointEb"] = Module["asm"]["Wf"]).apply(null, arguments)
};
var __ZN4cura22ProgressStageEstimator9nextStageEPNS_17ProgressEstimatorE = Module["__ZN4cura22ProgressStageEstimator9nextStageEPNS_17ProgressEstimatorE"] = function () {
    return (__ZN4cura22ProgressStageEstimator9nextStageEPNS_17ProgressEstimatorE = Module["__ZN4cura22ProgressStageEstimator9nextStageEPNS_17ProgressEstimatorE"] = Module["asm"]["Xf"]).apply(null, arguments)
};
var __ZN4cura15SpaghettiInfill23generateSpaghettiInfillERNS_16SliceMeshStorageE = Module["__ZN4cura15SpaghettiInfill23generateSpaghettiInfillERNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura15SpaghettiInfill23generateSpaghettiInfillERNS_16SliceMeshStorageE = Module["__ZN4cura15SpaghettiInfill23generateSpaghettiInfillERNS_16SliceMeshStorageE"] = Module["asm"]["Yf"]).apply(null, arguments)
};
var __ZN4cura10SubDivCube16precomputeOctreeERNS_16SliceMeshStorageE = Module["__ZN4cura10SubDivCube16precomputeOctreeERNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura10SubDivCube16precomputeOctreeERNS_16SliceMeshStorageE = Module["__ZN4cura10SubDivCube16precomputeOctreeERNS_16SliceMeshStorageE"] = Module["asm"]["Zf"]).apply(null, arguments)
};
var __ZN4cura21enableProgressLoggingEv = Module["__ZN4cura21enableProgressLoggingEv"] = function () {
    return (__ZN4cura21enableProgressLoggingEv = Module["__ZN4cura21enableProgressLoggingEv"] = Module["asm"]["_f"]).apply(null, arguments)
};
var __ZN4cura8Settings3addERKNSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES7_ = Module["__ZN4cura8Settings3addERKNSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES7_"] = function () {
    return (__ZN4cura8Settings3addERKNSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES7_ = Module["__ZN4cura8Settings3addERKNSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEES7_"] = Module["asm"]["$f"]).apply(null, arguments)
};
var __ZN4cura20increaseVerboseLevelEv = Module["__ZN4cura20increaseVerboseLevelEv"] = function () {
    return (__ZN4cura20increaseVerboseLevelEv = Module["__ZN4cura20increaseVerboseLevelEv"] = Module["asm"]["ag"]).apply(null, arguments)
};
var ___errno_location = Module["___errno_location"] = function () {
    return (___errno_location = Module["___errno_location"] = Module["asm"]["bg"]).apply(null, arguments)
};
var _malloc = Module["_malloc"] = function () {
    return (_malloc = Module["_malloc"] = Module["asm"]["cg"]).apply(null, arguments)
};
var __ZNK4cura25ImageBasedDensityProviderclERKNS_6AABB3DE = Module["__ZNK4cura25ImageBasedDensityProviderclERKNS_6AABB3DE"] = function () {
    return (__ZNK4cura25ImageBasedDensityProviderclERKNS_6AABB3DE = Module["__ZNK4cura25ImageBasedDensityProviderclERKNS_6AABB3DE"] = Module["asm"]["dg"]).apply(null, arguments)
};
var __ZN4cura26NoZigZagConnectorProcessor14registerVertexERKN10ClipperLib8IntPointE = Module["__ZN4cura26NoZigZagConnectorProcessor14registerVertexERKN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura26NoZigZagConnectorProcessor14registerVertexERKN10ClipperLib8IntPointE = Module["__ZN4cura26NoZigZagConnectorProcessor14registerVertexERKN10ClipperLib8IntPointE"] = Module["asm"]["eg"]).apply(null, arguments)
};
var __ZN4cura26NoZigZagConnectorProcessor35registerScanlineSegmentIntersectionERKN10ClipperLib8IntPointEi = Module["__ZN4cura26NoZigZagConnectorProcessor35registerScanlineSegmentIntersectionERKN10ClipperLib8IntPointEi"] = function () {
    return (__ZN4cura26NoZigZagConnectorProcessor35registerScanlineSegmentIntersectionERKN10ClipperLib8IntPointEi = Module["__ZN4cura26NoZigZagConnectorProcessor35registerScanlineSegmentIntersectionERKN10ClipperLib8IntPointEi"] = Module["asm"]["fg"]).apply(null, arguments)
};
var __ZN4cura26NoZigZagConnectorProcessor20registerPolyFinishedEv = Module["__ZN4cura26NoZigZagConnectorProcessor20registerPolyFinishedEv"] = function () {
    return (__ZN4cura26NoZigZagConnectorProcessor20registerPolyFinishedEv = Module["__ZN4cura26NoZigZagConnectorProcessor20registerPolyFinishedEv"] = Module["asm"]["gg"]).apply(null, arguments)
};
var __ZN4cura24ZigzagConnectorProcessor14registerVertexERKN10ClipperLib8IntPointE = Module["__ZN4cura24ZigzagConnectorProcessor14registerVertexERKN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura24ZigzagConnectorProcessor14registerVertexERKN10ClipperLib8IntPointE = Module["__ZN4cura24ZigzagConnectorProcessor14registerVertexERKN10ClipperLib8IntPointE"] = Module["asm"]["hg"]).apply(null, arguments)
};
var __ZNK4cura24ZigzagConnectorProcessor25shouldAddCurrentConnectorEii = Module["__ZNK4cura24ZigzagConnectorProcessor25shouldAddCurrentConnectorEii"] = function () {
    return (__ZNK4cura24ZigzagConnectorProcessor25shouldAddCurrentConnectorEii = Module["__ZNK4cura24ZigzagConnectorProcessor25shouldAddCurrentConnectorEii"] = Module["asm"]["ig"]).apply(null, arguments)
};
var __ZN4cura24ZigzagConnectorProcessor35registerScanlineSegmentIntersectionERKN10ClipperLib8IntPointEi = Module["__ZN4cura24ZigzagConnectorProcessor35registerScanlineSegmentIntersectionERKN10ClipperLib8IntPointEi"] = function () {
    return (__ZN4cura24ZigzagConnectorProcessor35registerScanlineSegmentIntersectionERKN10ClipperLib8IntPointEi = Module["__ZN4cura24ZigzagConnectorProcessor35registerScanlineSegmentIntersectionERKN10ClipperLib8IntPointEi"] = Module["asm"]["jg"]).apply(null, arguments)
};
var __ZN4cura24ZigzagConnectorProcessor27checkAndAddZagConnectorLineEPN10ClipperLib8IntPointES3_ = Module["__ZN4cura24ZigzagConnectorProcessor27checkAndAddZagConnectorLineEPN10ClipperLib8IntPointES3_"] = function () {
    return (__ZN4cura24ZigzagConnectorProcessor27checkAndAddZagConnectorLineEPN10ClipperLib8IntPointES3_ = Module["__ZN4cura24ZigzagConnectorProcessor27checkAndAddZagConnectorLineEPN10ClipperLib8IntPointES3_"] = Module["asm"]["kg"]).apply(null, arguments)
};
var __ZN4cura24ZigzagConnectorProcessor15addZagConnectorERNSt3__26vectorIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEEb = Module["__ZN4cura24ZigzagConnectorProcessor15addZagConnectorERNSt3__26vectorIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEEb"] = function () {
    return (__ZN4cura24ZigzagConnectorProcessor15addZagConnectorERNSt3__26vectorIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEEb = Module["__ZN4cura24ZigzagConnectorProcessor15addZagConnectorERNSt3__26vectorIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEEb"] = Module["asm"]["lg"]).apply(null, arguments)
};
var __ZN4cura24ZigzagConnectorProcessor20registerPolyFinishedEv = Module["__ZN4cura24ZigzagConnectorProcessor20registerPolyFinishedEv"] = function () {
    return (__ZN4cura24ZigzagConnectorProcessor20registerPolyFinishedEv = Module["__ZN4cura24ZigzagConnectorProcessor20registerPolyFinishedEv"] = Module["asm"]["mg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill10createTreeEv = Module["__ZN4cura14SierpinskiFill10createTreeEv"] = function () {
    return (__ZN4cura14SierpinskiFill10createTreeEv = Module["__ZN4cura14SierpinskiFill10createTreeEv"] = Module["asm"]["ng"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill12subdivideAllEv = Module["__ZN4cura14SierpinskiFill12subdivideAllEv"] = function () {
    return (__ZN4cura14SierpinskiFill12subdivideAllEv = Module["__ZN4cura14SierpinskiFill12subdivideAllEv"] = Module["asm"]["og"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill24bubbleUpConstraintErrorsEv = Module["__ZN4cura14SierpinskiFill24bubbleUpConstraintErrorsEv"] = function () {
    return (__ZN4cura14SierpinskiFill24bubbleUpConstraintErrorsEv = Module["__ZN4cura14SierpinskiFill24bubbleUpConstraintErrorsEv"] = Module["asm"]["pg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill10debugCheckEb = Module["__ZN4cura14SierpinskiFill10debugCheckEb"] = function () {
    return (__ZN4cura14SierpinskiFill10debugCheckEb = Module["__ZN4cura14SierpinskiFill10debugCheckEb"] = Module["asm"]["qg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill12settleErrorsEv = Module["__ZN4cura14SierpinskiFill12settleErrorsEv"] = function () {
    return (__ZN4cura14SierpinskiFill12settleErrorsEv = Module["__ZN4cura14SierpinskiFill12settleErrorsEv"] = Module["asm"]["rg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill12diffuseErrorEv = Module["__ZN4cura14SierpinskiFill12diffuseErrorEv"] = function () {
    return (__ZN4cura14SierpinskiFill12diffuseErrorEv = Module["__ZN4cura14SierpinskiFill12diffuseErrorEv"] = Module["asm"]["sg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill10createTreeERNS0_18SierpinskiTriangleE = Module["__ZN4cura14SierpinskiFill10createTreeERNS0_18SierpinskiTriangleE"] = function () {
    return (__ZN4cura14SierpinskiFill10createTreeERNS0_18SierpinskiTriangleE = Module["__ZN4cura14SierpinskiFill10createTreeERNS0_18SierpinskiTriangleE"] = Module["asm"]["tg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill20createTreeStatisticsERNS0_18SierpinskiTriangleE = Module["__ZN4cura14SierpinskiFill20createTreeStatisticsERNS0_18SierpinskiTriangleE"] = function () {
    return (__ZN4cura14SierpinskiFill20createTreeStatisticsERNS0_18SierpinskiTriangleE = Module["__ZN4cura14SierpinskiFill20createTreeStatisticsERNS0_18SierpinskiTriangleE"] = Module["asm"]["ug"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill26createTreeRequestedLengthsERNS0_18SierpinskiTriangleE = Module["__ZN4cura14SierpinskiFill26createTreeRequestedLengthsERNS0_18SierpinskiTriangleE"] = function () {
    return (__ZN4cura14SierpinskiFill26createTreeRequestedLengthsERNS0_18SierpinskiTriangleE = Module["__ZN4cura14SierpinskiFill26createTreeRequestedLengthsERNS0_18SierpinskiTriangleE"] = Module["asm"]["vg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill24createLowerBoundSequenceEv = Module["__ZN4cura14SierpinskiFill24createLowerBoundSequenceEv"] = function () {
    return (__ZN4cura14SierpinskiFill24createLowerBoundSequenceEv = Module["__ZN4cura14SierpinskiFill24createLowerBoundSequenceEv"] = Module["asm"]["wg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill18SierpinskiTriangle13getValueErrorEv = Module["__ZN4cura14SierpinskiFill18SierpinskiTriangle13getValueErrorEv"] = function () {
    return (__ZN4cura14SierpinskiFill18SierpinskiTriangle13getValueErrorEv = Module["__ZN4cura14SierpinskiFill18SierpinskiTriangle13getValueErrorEv"] = Module["asm"]["xg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill26redistributeLeftoverErrorsENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_b = Module["__ZN4cura14SierpinskiFill26redistributeLeftoverErrorsENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_b"] = function () {
    return (__ZN4cura14SierpinskiFill26redistributeLeftoverErrorsENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_b = Module["__ZN4cura14SierpinskiFill26redistributeLeftoverErrorsENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_b"] = Module["asm"]["yg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill13balanceErrorsENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_ = Module["__ZN4cura14SierpinskiFill13balanceErrorsENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_"] = function () {
    return (__ZN4cura14SierpinskiFill13balanceErrorsENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_ = Module["__ZN4cura14SierpinskiFill13balanceErrorsENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_"] = Module["asm"]["zg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill21isConstrainedBackwardENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEE = Module["__ZN4cura14SierpinskiFill21isConstrainedBackwardENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEE"] = function () {
    return (__ZN4cura14SierpinskiFill21isConstrainedBackwardENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEE = Module["__ZN4cura14SierpinskiFill21isConstrainedBackwardENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEE"] = Module["asm"]["Ag"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill20isConstrainedForwardENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEE = Module["__ZN4cura14SierpinskiFill20isConstrainedForwardENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEE"] = function () {
    return (__ZN4cura14SierpinskiFill20isConstrainedForwardENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEE = Module["__ZN4cura14SierpinskiFill20isConstrainedForwardENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEE"] = Module["asm"]["Bg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill19getSubdivisionErrorENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_ = Module["__ZN4cura14SierpinskiFill19getSubdivisionErrorENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_"] = function () {
    return (__ZN4cura14SierpinskiFill19getSubdivisionErrorENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_ = Module["__ZN4cura14SierpinskiFill19getSubdivisionErrorENSt3__215__list_iteratorIPNS0_18SierpinskiTriangleEPvEES6_"] = Module["asm"]["Cg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill18SierpinskiTriangle19getSubdivisionErrorEv = Module["__ZN4cura14SierpinskiFill18SierpinskiTriangle19getSubdivisionErrorEv"] = function () {
    return (__ZN4cura14SierpinskiFill18SierpinskiTriangle19getSubdivisionErrorEv = Module["__ZN4cura14SierpinskiFill18SierpinskiTriangle19getSubdivisionErrorEv"] = Module["asm"]["Dg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill18SierpinskiTriangle15getErroredValueEv = Module["__ZN4cura14SierpinskiFill18SierpinskiTriangle15getErroredValueEv"] = function () {
    return (__ZN4cura14SierpinskiFill18SierpinskiTriangle15getErroredValueEv = Module["__ZN4cura14SierpinskiFill18SierpinskiTriangle15getErroredValueEv"] = Module["asm"]["Eg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill11debugOutputERNS_3SVGE = Module["__ZN4cura14SierpinskiFill11debugOutputERNS_3SVGE"] = function () {
    return (__ZN4cura14SierpinskiFill11debugOutputERNS_3SVGE = Module["__ZN4cura14SierpinskiFill11debugOutputERNS_3SVGE"] = Module["asm"]["Fg"]).apply(null, arguments)
};
var __ZN4cura14SierpinskiFill18SierpinskiTriangle13getTotalErrorEv = Module["__ZN4cura14SierpinskiFill18SierpinskiTriangle13getTotalErrorEv"] = function () {
    return (__ZN4cura14SierpinskiFill18SierpinskiTriangle13getTotalErrorEv = Module["__ZN4cura14SierpinskiFill18SierpinskiTriangle13getTotalErrorEv"] = Module["asm"]["Gg"]).apply(null, arguments)
};
var __ZN4cura4AABB7includeEN10ClipperLib8IntPointE = Module["__ZN4cura4AABB7includeEN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura4AABB7includeEN10ClipperLib8IntPointE = Module["__ZN4cura4AABB7includeEN10ClipperLib8IntPointE"] = Module["asm"]["Hg"]).apply(null, arguments)
};
var __ZN4cura3SVG12writePolygonENS_15ConstPolygonRefENS0_5ColorEf = Module["__ZN4cura3SVG12writePolygonENS_15ConstPolygonRefENS0_5ColorEf"] = function () {
    return (__ZN4cura3SVG12writePolygonENS_15ConstPolygonRefENS0_5ColorEf = Module["__ZN4cura3SVG12writePolygonENS_15ConstPolygonRefENS0_5ColorEf"] = Module["asm"]["Ig"]).apply(null, arguments)
};
var __ZN4cura3SVG9writeLineERKN10ClipperLib8IntPointES4_NS0_5ColorEf = Module["__ZN4cura3SVG9writeLineERKN10ClipperLib8IntPointES4_NS0_5ColorEf"] = function () {
    return (__ZN4cura3SVG9writeLineERKN10ClipperLib8IntPointES4_NS0_5ColorEf = Module["__ZN4cura3SVG9writeLineERKN10ClipperLib8IntPointES4_NS0_5ColorEf"] = Module["asm"]["Jg"]).apply(null, arguments)
};
var __ZN4cura15SpaghettiInfill28generateTotalSpaghettiInfillERNS_16SliceMeshStorageE = Module["__ZN4cura15SpaghettiInfill28generateTotalSpaghettiInfillERNS_16SliceMeshStorageE"] = function () {
    return (__ZN4cura15SpaghettiInfill28generateTotalSpaghettiInfillERNS_16SliceMeshStorageE = Module["__ZN4cura15SpaghettiInfill28generateTotalSpaghettiInfillERNS_16SliceMeshStorageE"] = Module["asm"]["Kg"]).apply(null, arguments)
};
var __ZN4cura15SpaghettiInfill12InfillPillar22addToTopSliceLayerPartExx = Module["__ZN4cura15SpaghettiInfill12InfillPillar22addToTopSliceLayerPartExx"] = function () {
    return (__ZN4cura15SpaghettiInfill12InfillPillar22addToTopSliceLayerPartExx = Module["__ZN4cura15SpaghettiInfill12InfillPillar22addToTopSliceLayerPartExx"] = Module["asm"]["Lg"]).apply(null, arguments)
};
var __ZNK4cura15SpaghettiInfill12InfillPillar11isConnectedERKNS_12PolygonsPartE = Module["__ZNK4cura15SpaghettiInfill12InfillPillar11isConnectedERKNS_12PolygonsPartE"] = function () {
    return (__ZNK4cura15SpaghettiInfill12InfillPillar11isConnectedERKNS_12PolygonsPartE = Module["__ZNK4cura15SpaghettiInfill12InfillPillar11isConnectedERKNS_12PolygonsPartE"] = Module["asm"]["Mg"]).apply(null, arguments)
};
var __ZN4cura10SubDivCube24generateSubdivisionLinesExRNS_8PolygonsERA3_S1_ = Module["__ZN4cura10SubDivCube24generateSubdivisionLinesExRNS_8PolygonsERA3_S1_"] = function () {
    return (__ZN4cura10SubDivCube24generateSubdivisionLinesExRNS_8PolygonsERA3_S1_ = Module["__ZN4cura10SubDivCube24generateSubdivisionLinesExRNS_8PolygonsERA3_S1_"] = Module["asm"]["Ng"]).apply(null, arguments)
};
var __ZN4cura10SubDivCube17addLineAndCombineERNS_8PolygonsEN10ClipperLib8IntPointES4_ = Module["__ZN4cura10SubDivCube17addLineAndCombineERNS_8PolygonsEN10ClipperLib8IntPointES4_"] = function () {
    return (__ZN4cura10SubDivCube17addLineAndCombineERNS_8PolygonsEN10ClipperLib8IntPointES4_ = Module["__ZN4cura10SubDivCube17addLineAndCombineERNS_8PolygonsEN10ClipperLib8IntPointES4_"] = Module["asm"]["Og"]).apply(null, arguments)
};
var __ZN4cura10SubDivCube18rotatePointInitialERN10ClipperLib8IntPointE = Module["__ZN4cura10SubDivCube18rotatePointInitialERN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura10SubDivCube18rotatePointInitialERN10ClipperLib8IntPointE = Module["__ZN4cura10SubDivCube18rotatePointInitialERN10ClipperLib8IntPointE"] = Module["asm"]["Pg"]).apply(null, arguments)
};
var __ZN4cura10SubDivCube14rotatePoint120ERN10ClipperLib8IntPointE = Module["__ZN4cura10SubDivCube14rotatePoint120ERN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura10SubDivCube14rotatePoint120ERN10ClipperLib8IntPointE = Module["__ZN4cura10SubDivCube14rotatePoint120ERN10ClipperLib8IntPointE"] = Module["asm"]["Qg"]).apply(null, arguments)
};
var __ZN4cura4Comb18moveCombPathInsideERNS_8PolygonsES2_RNS_8CombPathES4_ = Module["__ZN4cura4Comb18moveCombPathInsideERNS_8PolygonsES2_RNS_8CombPathES4_"] = function () {
    return (__ZN4cura4Comb18moveCombPathInsideERNS_8PolygonsES2_RNS_8CombPathES4_ = Module["__ZN4cura4Comb18moveCombPathInsideERNS_8PolygonsES2_RNS_8CombPathES4_"] = Module["asm"]["Rg"]).apply(null, arguments)
};
var __ZN4cura4Comb8Crossing19findCrossingInOrMidERKNS_9PartsViewEN10ClipperLib8IntPointE = Module["__ZN4cura4Comb8Crossing19findCrossingInOrMidERKNS_9PartsViewEN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura4Comb8Crossing19findCrossingInOrMidERKNS_9PartsViewEN10ClipperLib8IntPointE = Module["__ZN4cura4Comb8Crossing19findCrossingInOrMidERKNS_9PartsViewEN10ClipperLib8IntPointE"] = Module["asm"]["Sg"]).apply(null, arguments)
};
var __ZN4cura4Comb8Crossing11findOutsideERKNS_8PolygonsEN10ClipperLib8IntPointEbRS0_ = Module["__ZN4cura4Comb8Crossing11findOutsideERKNS_8PolygonsEN10ClipperLib8IntPointEbRS0_"] = function () {
    return (__ZN4cura4Comb8Crossing11findOutsideERKNS_8PolygonsEN10ClipperLib8IntPointEbRS0_ = Module["__ZN4cura4Comb8Crossing11findOutsideERKNS_8PolygonsEN10ClipperLib8IntPointEbRS0_"] = Module["asm"]["Tg"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentEN10ClipperLib8IntPointES2_RKNS_14SparseLineGridINS_18PolygonsPointIndexENS_32PolygonsPointIndexSegmentLocatorEEEPS4_ = Module["__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentEN10ClipperLib8IntPointES2_RKNS_14SparseLineGridINS_18PolygonsPointIndexENS_32PolygonsPointIndexSegmentLocatorEEEPS4_"] = function () {
    return (__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentEN10ClipperLib8IntPointES2_RKNS_14SparseLineGridINS_18PolygonsPointIndexENS_32PolygonsPointIndexSegmentLocatorEEEPS4_ = Module["__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentEN10ClipperLib8IntPointES2_RKNS_14SparseLineGridINS_18PolygonsPointIndexENS_32PolygonsPointIndexSegmentLocatorEEEPS4_"] = Module["asm"]["Ug"]).apply(null, arguments)
};
var __ZN4cura4Comb10moveInsideERNS_8PolygonsEbPNS_14SparseLineGridINS_18PolygonsPointIndexENS_32PolygonsPointIndexSegmentLocatorEEERN10ClipperLib8IntPointERj = Module["__ZN4cura4Comb10moveInsideERNS_8PolygonsEbPNS_14SparseLineGridINS_18PolygonsPointIndexENS_32PolygonsPointIndexSegmentLocatorEEERN10ClipperLib8IntPointERj"] = function () {
    return (__ZN4cura4Comb10moveInsideERNS_8PolygonsEbPNS_14SparseLineGridINS_18PolygonsPointIndexENS_32PolygonsPointIndexSegmentLocatorEEERN10ClipperLib8IntPointERj = Module["__ZN4cura4Comb10moveInsideERNS_8PolygonsEbPNS_14SparseLineGridINS_18PolygonsPointIndexENS_32PolygonsPointIndexSegmentLocatorEEERN10ClipperLib8IntPointERj"] = Module["asm"]["Vg"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils31walkToNearestSmallestConnectionERNS_19ClosestPolygonPointES2_ = Module["__ZN4cura12PolygonUtils31walkToNearestSmallestConnectionERNS_19ClosestPolygonPointES2_"] = function () {
    return (__ZN4cura12PolygonUtils31walkToNearestSmallestConnectionERNS_19ClosestPolygonPointES2_ = Module["__ZN4cura12PolygonUtils31walkToNearestSmallestConnectionERNS_19ClosestPolygonPointES2_"] = Module["asm"]["Wg"]).apply(null, arguments)
};
var __ZN4cura21LinePolygonsCrossings21calcScanlineCrossingsEb = Module["__ZN4cura21LinePolygonsCrossings21calcScanlineCrossingsEb"] = function () {
    return (__ZN4cura21LinePolygonsCrossings21calcScanlineCrossingsEb = Module["__ZN4cura21LinePolygonsCrossings21calcScanlineCrossingsEb"] = Module["asm"]["Xg"]).apply(null, arguments)
};
var __ZN4cura21LinePolygonsCrossings31lineSegmentCollidesWithBoundaryEv = Module["__ZN4cura21LinePolygonsCrossings31lineSegmentCollidesWithBoundaryEv"] = function () {
    return (__ZN4cura21LinePolygonsCrossings31lineSegmentCollidesWithBoundaryEv = Module["__ZN4cura21LinePolygonsCrossings31lineSegmentCollidesWithBoundaryEv"] = Module["asm"]["Yg"]).apply(null, arguments)
};
var __ZN4cura21LinePolygonsCrossings24generateBasicCombingPathERNS_8CombPathE = Module["__ZN4cura21LinePolygonsCrossings24generateBasicCombingPathERNS_8CombPathE"] = function () {
    return (__ZN4cura21LinePolygonsCrossings24generateBasicCombingPathERNS_8CombPathE = Module["__ZN4cura21LinePolygonsCrossings24generateBasicCombingPathERNS_8CombPathE"] = Module["asm"]["Zg"]).apply(null, arguments)
};
var __ZN4cura21LinePolygonsCrossings12optimizePathERNS_8CombPathES2_ = Module["__ZN4cura21LinePolygonsCrossings12optimizePathERNS_8CombPathES2_"] = function () {
    return (__ZN4cura21LinePolygonsCrossings12optimizePathERNS_8CombPathES2_ = Module["__ZN4cura21LinePolygonsCrossings12optimizePathERNS_8CombPathES2_"] = Module["asm"]["_g"]).apply(null, arguments)
};
var __ZN4cura21LinePolygonsCrossings24generateBasicCombingPathERNS0_13PolyCrossingsERNS_8CombPathE = Module["__ZN4cura21LinePolygonsCrossings24generateBasicCombingPathERNS0_13PolyCrossingsERNS_8CombPathE"] = function () {
    return (__ZN4cura21LinePolygonsCrossings24generateBasicCombingPathERNS0_13PolyCrossingsERNS_8CombPathE = Module["__ZN4cura21LinePolygonsCrossings24generateBasicCombingPathERNS0_13PolyCrossingsERNS_8CombPathE"] = Module["asm"]["$g"]).apply(null, arguments)
};
var __ZN4cura11logProgressEPKciif = Module["__ZN4cura11logProgressEPKciif"] = function () {
    return (__ZN4cura11logProgressEPKciif = Module["__ZN4cura11logProgressEPKciif"] = Module["asm"]["ah"]).apply(null, arguments)
};
var __ZN4cura22ProgressStageEstimator8progressEi = Module["__ZN4cura22ProgressStageEstimator8progressEi"] = function () {
    return (__ZN4cura22ProgressStageEstimator8progressEi = Module["__ZN4cura22ProgressStageEstimator8progressEi"] = Module["asm"]["bh"]).apply(null, arguments)
};
var __ZN4cura20AdaptiveLayerHeights28calculateAllowedLayerHeightsEv = Module["__ZN4cura20AdaptiveLayerHeights28calculateAllowedLayerHeightsEv"] = function () {
    return (__ZN4cura20AdaptiveLayerHeights28calculateAllowedLayerHeightsEv = Module["__ZN4cura20AdaptiveLayerHeights28calculateAllowedLayerHeightsEv"] = Module["asm"]["ch"]).apply(null, arguments)
};
var __ZN4cura20AdaptiveLayerHeights27calculateMeshTriangleSlopesEv = Module["__ZN4cura20AdaptiveLayerHeights27calculateMeshTriangleSlopesEv"] = function () {
    return (__ZN4cura20AdaptiveLayerHeights27calculateMeshTriangleSlopesEv = Module["__ZN4cura20AdaptiveLayerHeights27calculateMeshTriangleSlopesEv"] = Module["asm"]["dh"]).apply(null, arguments)
};
var __ZN4cura20AdaptiveLayerHeights15calculateLayersEv = Module["__ZN4cura20AdaptiveLayerHeights15calculateLayersEv"] = function () {
    return (__ZN4cura20AdaptiveLayerHeights15calculateLayersEv = Module["__ZN4cura20AdaptiveLayerHeights15calculateLayersEv"] = Module["asm"]["eh"]).apply(null, arguments)
};
var __ZN4cura17PathConfigStorage25handleInitialLayerSpeedupERKNS_16SliceDataStorageERKNS_10LayerIndexEm = Module["__ZN4cura17PathConfigStorage25handleInitialLayerSpeedupERKNS_16SliceDataStorageERKNS_10LayerIndexEm"] = function () {
    return (__ZN4cura17PathConfigStorage25handleInitialLayerSpeedupERKNS_16SliceDataStorageERKNS_10LayerIndexEm = Module["__ZN4cura17PathConfigStorage25handleInitialLayerSpeedupERKNS_16SliceDataStorageERKNS_10LayerIndexEm"] = Module["asm"]["fh"]).apply(null, arguments)
};
var __ZN4cura17PathConfigStorage15MeshPathConfigs15smoothAllSpeedsENS_15GCodePathConfig16SpeedDerivativesERKNS_10LayerIndexES6_ = Module["__ZN4cura17PathConfigStorage15MeshPathConfigs15smoothAllSpeedsENS_15GCodePathConfig16SpeedDerivativesERKNS_10LayerIndexES6_"] = function () {
    return (__ZN4cura17PathConfigStorage15MeshPathConfigs15smoothAllSpeedsENS_15GCodePathConfig16SpeedDerivativesERKNS_10LayerIndexES6_ = Module["__ZN4cura17PathConfigStorage15MeshPathConfigs15smoothAllSpeedsENS_15GCodePathConfig16SpeedDerivativesERKNS_10LayerIndexES6_"] = Module["asm"]["gh"]).apply(null, arguments)
};
var __ZN4cura4AABB9calculateENS_15ConstPolygonRefE = Module["__ZN4cura4AABB9calculateENS_15ConstPolygonRefE"] = function () {
    return (__ZN4cura4AABB9calculateENS_15ConstPolygonRefE = Module["__ZN4cura4AABB9calculateENS_15ConstPolygonRefE"] = Module["asm"]["hh"]).apply(null, arguments)
};
var __ZN4cura4AABB7includeES0_ = Module["__ZN4cura4AABB7includeES0_"] = function () {
    return (__ZN4cura4AABB7includeES0_ = Module["__ZN4cura4AABB7includeES0_"] = Module["asm"]["ih"]).apply(null, arguments)
};
var __ZN4cura4AABB5roundEx = Module["__ZN4cura4AABB5roundEx"] = function () {
    return (__ZN4cura4AABB5roundEx = Module["__ZN4cura4AABB5roundEx"] = Module["asm"]["jh"]).apply(null, arguments)
};
var __ZN4cura6AABB3D6offsetEN10ClipperLib8IntPointE = Module["__ZN4cura6AABB3D6offsetEN10ClipperLib8IntPointE"] = function () {
    return (__ZN4cura6AABB3D6offsetEN10ClipperLib8IntPointE = Module["__ZN4cura6AABB3D6offsetEN10ClipperLib8IntPointE"] = Module["asm"]["kh"]).apply(null, arguments)
};
var __ZN4cura11LinearAlg2D22getPointOnLineWithDistERKN10ClipperLib8IntPointES4_S4_xRS2_ = Module["__ZN4cura11LinearAlg2D22getPointOnLineWithDistERKN10ClipperLib8IntPointES4_S4_xRS2_"] = function () {
    return (__ZN4cura11LinearAlg2D22getPointOnLineWithDistERKN10ClipperLib8IntPointES4_S4_xRS2_ = Module["__ZN4cura11LinearAlg2D22getPointOnLineWithDistERKN10ClipperLib8IntPointES4_S4_xRS2_"] = Module["asm"]["lh"]).apply(null, arguments)
};
var __ZN4cura11LinearAlg2D19lineSegmentsCollideERKN10ClipperLib8IntPointES4_S2_S2_ = Module["__ZN4cura11LinearAlg2D19lineSegmentsCollideERKN10ClipperLib8IntPointES4_S2_S2_"] = function () {
    return (__ZN4cura11LinearAlg2D19lineSegmentsCollideERKN10ClipperLib8IntPointES4_S2_S2_ = Module["__ZN4cura11LinearAlg2D19lineSegmentsCollideERKN10ClipperLib8IntPointES4_S2_S2_"] = Module["asm"]["mh"]).apply(null, arguments)
};
var __ZN4cura10ListPolyIt22convertPolygonsToListsERKNS_8PolygonsERNSt3__26vectorINS4_4listIN10ClipperLib8IntPointENS4_9allocatorIS8_EEEENS9_ISB_EEEE = Module["__ZN4cura10ListPolyIt22convertPolygonsToListsERKNS_8PolygonsERNSt3__26vectorINS4_4listIN10ClipperLib8IntPointENS4_9allocatorIS8_EEEENS9_ISB_EEEE"] = function () {
    return (__ZN4cura10ListPolyIt22convertPolygonsToListsERKNS_8PolygonsERNSt3__26vectorINS4_4listIN10ClipperLib8IntPointENS4_9allocatorIS8_EEEENS9_ISB_EEEE = Module["__ZN4cura10ListPolyIt22convertPolygonsToListsERKNS_8PolygonsERNSt3__26vectorINS4_4listIN10ClipperLib8IntPointENS4_9allocatorIS8_EEEENS9_ISB_EEEE"] = Module["asm"]["nh"]).apply(null, arguments)
};
var __ZN4cura10ListPolyIt20convertPolygonToListENS_15ConstPolygonRefERNSt3__24listIN10ClipperLib8IntPointENS2_9allocatorIS5_EEEE = Module["__ZN4cura10ListPolyIt20convertPolygonToListENS_15ConstPolygonRefERNSt3__24listIN10ClipperLib8IntPointENS2_9allocatorIS5_EEEE"] = function () {
    return (__ZN4cura10ListPolyIt20convertPolygonToListENS_15ConstPolygonRefERNSt3__24listIN10ClipperLib8IntPointENS2_9allocatorIS5_EEEE = Module["__ZN4cura10ListPolyIt20convertPolygonToListENS_15ConstPolygonRefERNSt3__24listIN10ClipperLib8IntPointENS2_9allocatorIS5_EEEE"] = Module["asm"]["oh"]).apply(null, arguments)
};
var __ZN4cura10ListPolyIt29convertListPolygonsToPolygonsERKNSt3__26vectorINS1_4listIN10ClipperLib8IntPointENS1_9allocatorIS5_EEEENS6_IS8_EEEERNS_8PolygonsE = Module["__ZN4cura10ListPolyIt29convertListPolygonsToPolygonsERKNSt3__26vectorINS1_4listIN10ClipperLib8IntPointENS1_9allocatorIS5_EEEENS6_IS8_EEEERNS_8PolygonsE"] = function () {
    return (__ZN4cura10ListPolyIt29convertListPolygonsToPolygonsERKNSt3__26vectorINS1_4listIN10ClipperLib8IntPointENS1_9allocatorIS5_EEEENS6_IS8_EEEERNS_8PolygonsE = Module["__ZN4cura10ListPolyIt29convertListPolygonsToPolygonsERKNSt3__26vectorINS1_4listIN10ClipperLib8IntPointENS1_9allocatorIS5_EEEENS6_IS8_EEEERNS_8PolygonsE"] = Module["asm"]["ph"]).apply(null, arguments)
};
var __ZN4cura10ListPolyIt27convertListPolygonToPolygonERKNSt3__24listIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEENS_10PolygonRefE = Module["__ZN4cura10ListPolyIt27convertListPolygonToPolygonERKNSt3__24listIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEENS_10PolygonRefE"] = function () {
    return (__ZN4cura10ListPolyIt27convertListPolygonToPolygonERKNSt3__24listIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEENS_10PolygonRefE = Module["__ZN4cura10ListPolyIt27convertListPolygonToPolygonERKNSt3__24listIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEENS_10PolygonRefE"] = Module["asm"]["qh"]).apply(null, arguments)
};
var __ZNK4cura19MinimumSpanningTree4Edge6lengthEv = Module["__ZNK4cura19MinimumSpanningTree4Edge6lengthEv"] = function () {
    return (__ZNK4cura19MinimumSpanningTree4Edge6lengthEv = Module["__ZNK4cura19MinimumSpanningTree4Edge6lengthEv"] = Module["asm"]["rh"]).apply(null, arguments)
};
var __ZNK4cura6Point3neERKS0_ = Module["__ZNK4cura6Point3neERKS0_"] = function () {
    return (__ZNK4cura6Point3neERKS0_ = Module["__ZNK4cura6Point3neERKS0_"] = Module["asm"]["sh"]).apply(null, arguments)
};
var __ZN4cura16PolygonConnector17addPolygonSegmentERKNS_19ClosestPolygonPointES3_NS_10PolygonRefE = Module["__ZN4cura16PolygonConnector17addPolygonSegmentERKNS_19ClosestPolygonPointES3_NS_10PolygonRefE"] = function () {
    return (__ZN4cura16PolygonConnector17addPolygonSegmentERKNS_19ClosestPolygonPointES3_NS_10PolygonRefE = Module["__ZN4cura16PolygonConnector17addPolygonSegmentERKNS_19ClosestPolygonPointES3_NS_10PolygonRefE"] = Module["asm"]["th"]).apply(null, arguments)
};
var __ZN4cura22PolygonProximityLinker15addSharpCornersEv = Module["__ZN4cura22PolygonProximityLinker15addSharpCornersEv"] = function () {
    return (__ZN4cura22PolygonProximityLinker15addSharpCornersEv = Module["__ZN4cura22PolygonProximityLinker15addSharpCornersEv"] = Module["asm"]["uh"]).apply(null, arguments)
};
var __ZN4cura22PolygonProximityLinker19findProximatePointsEv = Module["__ZN4cura22PolygonProximityLinker19findProximatePointsEv"] = function () {
    return (__ZN4cura22PolygonProximityLinker19findProximatePointsEv = Module["__ZN4cura22PolygonProximityLinker19findProximatePointsEv"] = Module["asm"]["vh"]).apply(null, arguments)
};
var __ZN4cura22PolygonProximityLinker19addProximityEndingsEv = Module["__ZN4cura22PolygonProximityLinker19addProximityEndingsEv"] = function () {
    return (__ZN4cura22PolygonProximityLinker19addProximityEndingsEv = Module["__ZN4cura22PolygonProximityLinker19addProximityEndingsEv"] = Module["asm"]["wh"]).apply(null, arguments)
};
var __ZN4cura22PolygonProximityLinker14createLineGridEv = Module["__ZN4cura22PolygonProximityLinker14createLineGridEv"] = function () {
    return (__ZN4cura22PolygonProximityLinker14createLineGridEv = Module["__ZN4cura22PolygonProximityLinker14createLineGridEv"] = Module["asm"]["xh"]).apply(null, arguments)
};
var __ZN4cura22PolygonProximityLinker19findProximatePointsENS_10ListPolyItERNSt3__24listIN10ClipperLib8IntPointENS2_9allocatorIS5_EEEES1_S1_ = Module["__ZN4cura22PolygonProximityLinker19findProximatePointsENS_10ListPolyItERNSt3__24listIN10ClipperLib8IntPointENS2_9allocatorIS5_EEEES1_S1_"] = function () {
    return (__ZN4cura22PolygonProximityLinker19findProximatePointsENS_10ListPolyItERNSt3__24listIN10ClipperLib8IntPointENS2_9allocatorIS5_EEEES1_S1_ = Module["__ZN4cura22PolygonProximityLinker19findProximatePointsENS_10ListPolyItERNSt3__24listIN10ClipperLib8IntPointENS2_9allocatorIS5_EEEES1_S1_"] = Module["asm"]["yh"]).apply(null, arguments)
};
var __ZN4cura22PolygonProximityLinker18addProximityEndingERKNS_18ProximityPointLinkERKNS_10ListPolyItES6_S6_S6_RNSt3__213unordered_setIS1_NS7_4hashIS1_EENS7_8equal_toIS1_EENS7_9allocatorIS1_EEEE = Module["__ZN4cura22PolygonProximityLinker18addProximityEndingERKNS_18ProximityPointLinkERKNS_10ListPolyItES6_S6_S6_RNSt3__213unordered_setIS1_NS7_4hashIS1_EENS7_8equal_toIS1_EENS7_9allocatorIS1_EEEE"] = function () {
    return (__ZN4cura22PolygonProximityLinker18addProximityEndingERKNS_18ProximityPointLinkERKNS_10ListPolyItES6_S6_S6_RNSt3__213unordered_setIS1_NS7_4hashIS1_EENS7_8equal_toIS1_EENS7_9allocatorIS1_EEEE = Module["__ZN4cura22PolygonProximityLinker18addProximityEndingERKNS_18ProximityPointLinkERKNS_10ListPolyItES6_S6_S6_RNSt3__213unordered_setIS1_NS7_4hashIS1_EENS7_8equal_toIS1_EENS7_9allocatorIS1_EEEE"] = Module["asm"]["zh"]).apply(null, arguments)
};
var __ZN4cura22PolygonProximityLinker16addProximityLinkENS_10ListPolyItES1_xNS_22ProximityPointLinkTypeE = Module["__ZN4cura22PolygonProximityLinker16addProximityLinkENS_10ListPolyItES1_xNS_22ProximityPointLinkTypeE"] = function () {
    return (__ZN4cura22PolygonProximityLinker16addProximityLinkENS_10ListPolyItES1_xNS_22ProximityPointLinkTypeE = Module["__ZN4cura22PolygonProximityLinker16addProximityLinkENS_10ListPolyItES1_xNS_22ProximityPointLinkTypeE"] = Module["asm"]["Ah"]).apply(null, arguments)
};
var __ZN4cura22PolygonProximityLinker18addToPoint2LinkMapEN10ClipperLib8IntPointENSt3__221__hash_const_iteratorIPNS3_11__hash_nodeINS_18ProximityPointLinkEPvEEEE = Module["__ZN4cura22PolygonProximityLinker18addToPoint2LinkMapEN10ClipperLib8IntPointENSt3__221__hash_const_iteratorIPNS3_11__hash_nodeINS_18ProximityPointLinkEPvEEEE"] = function () {
    return (__ZN4cura22PolygonProximityLinker18addToPoint2LinkMapEN10ClipperLib8IntPointENSt3__221__hash_const_iteratorIPNS3_11__hash_nodeINS_18ProximityPointLinkEPvEEEE = Module["__ZN4cura22PolygonProximityLinker18addToPoint2LinkMapEN10ClipperLib8IntPointENSt3__221__hash_const_iteratorIPNS3_11__hash_nodeINS_18ProximityPointLinkEPvEEEE"] = Module["asm"]["Bh"]).apply(null, arguments)
};
var __ZN4cura22PolygonProximityLinker13addCornerLinkENS_10ListPolyItENS_22ProximityPointLinkTypeE = Module["__ZN4cura22PolygonProximityLinker13addCornerLinkENS_10ListPolyItENS_22ProximityPointLinkTypeE"] = function () {
    return (__ZN4cura22PolygonProximityLinker13addCornerLinkENS_10ListPolyItENS_22ProximityPointLinkTypeE = Module["__ZN4cura22PolygonProximityLinker13addCornerLinkENS_10ListPolyItENS_22ProximityPointLinkTypeE"] = Module["asm"]["Ch"]).apply(null, arguments)
};
var __ZNK4cura18ProximityPointLink7setDistEx = Module["__ZNK4cura18ProximityPointLink7setDistEx"] = function () {
    return (__ZNK4cura18ProximityPointLink7setDistEx = Module["__ZNK4cura18ProximityPointLink7setDistEx"] = Module["asm"]["Dh"]).apply(null, arguments)
};
var __ZN4cura22PolygonProximityLinker8isLinkedENS_10ListPolyItES1_ = Module["__ZN4cura22PolygonProximityLinker8isLinkedENS_10ListPolyItES1_"] = function () {
    return (__ZN4cura22PolygonProximityLinker8isLinkedENS_10ListPolyItES1_ = Module["__ZN4cura22PolygonProximityLinker8isLinkedENS_10ListPolyItES1_"] = Module["asm"]["Eh"]).apply(null, arguments)
};
var __ZNK4cura22PolygonProximityLinker14proximity2HTMLEPKc = Module["__ZNK4cura22PolygonProximityLinker14proximity2HTMLEPKc"] = function () {
    return (__ZNK4cura22PolygonProximityLinker14proximity2HTMLEPKc = Module["__ZNK4cura22PolygonProximityLinker14proximity2HTMLEPKc"] = Module["asm"]["Fh"]).apply(null, arguments)
};
var __ZN4cura3SVG10writeAreasERKNS_8PolygonsENS0_5ColorES4_f = Module["__ZN4cura3SVG10writeAreasERKNS_8PolygonsENS0_5ColorES4_f"] = function () {
    return (__ZN4cura3SVG10writeAreasERKNS_8PolygonsENS0_5ColorES4_f = Module["__ZN4cura3SVG10writeAreasERKNS_8PolygonsENS0_5ColorES4_f"] = Module["asm"]["Gh"]).apply(null, arguments)
};
var __ZN4cura3SVG10writePointERKN10ClipperLib8IntPointEbiNS0_5ColorE = Module["__ZN4cura3SVG10writePointERKN10ClipperLib8IntPointEbiNS0_5ColorE"] = function () {
    return (__ZN4cura3SVG10writePointERKN10ClipperLib8IntPointEbiNS0_5ColorE = Module["__ZN4cura3SVG10writePointERKN10ClipperLib8IntPointEbiNS0_5ColorE"] = Module["asm"]["Hh"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils22findSmallestConnectionERNS_19ClosestPolygonPointES2_ = Module["__ZN4cura12PolygonUtils22findSmallestConnectionERNS_19ClosestPolygonPointES2_"] = function () {
    return (__ZN4cura12PolygonUtils22findSmallestConnectionERNS_19ClosestPolygonPointES2_ = Module["__ZN4cura12PolygonUtils22findSmallestConnectionERNS_19ClosestPolygonPointES2_"] = Module["asm"]["Ih"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentENS_15ConstPolygonRefERKN10ClipperLib8IntPointES5_NS_11PointMatrixE = Module["__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentENS_15ConstPolygonRefERKN10ClipperLib8IntPointES5_NS_11PointMatrixE"] = function () {
    return (__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentENS_15ConstPolygonRefERKN10ClipperLib8IntPointES5_NS_11PointMatrixE = Module["__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentENS_15ConstPolygonRefERKN10ClipperLib8IntPointES5_NS_11PointMatrixE"] = Module["asm"]["Jh"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentENS_15ConstPolygonRefERKN10ClipperLib8IntPointES5_ = Module["__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentENS_15ConstPolygonRefERKN10ClipperLib8IntPointES5_"] = function () {
    return (__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentENS_15ConstPolygonRefERKN10ClipperLib8IntPointES5_ = Module["__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentENS_15ConstPolygonRefERKN10ClipperLib8IntPointES5_"] = Module["asm"]["Kh"]).apply(null, arguments)
};
var __ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentERKNS_8PolygonsERKN10ClipperLib8IntPointES7_NS_11PointMatrixE = Module["__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentERKNS_8PolygonsERKN10ClipperLib8IntPointES7_NS_11PointMatrixE"] = function () {
    return (__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentERKNS_8PolygonsERKN10ClipperLib8IntPointES7_NS_11PointMatrixE = Module["__ZN4cura12PolygonUtils30polygonCollidesWithLineSegmentERKNS_8PolygonsERKN10ClipperLib8IntPointES7_NS_11PointMatrixE"] = Module["asm"]["Lh"]).apply(null, arguments)
};
var __ZNK4cura8Polygons9insideOldEN10ClipperLib8IntPointEb = Module["__ZNK4cura8Polygons9insideOldEN10ClipperLib8IntPointEb"] = function () {
    return (__ZNK4cura8Polygons9insideOldEN10ClipperLib8IntPointEb = Module["__ZNK4cura8Polygons9insideOldEN10ClipperLib8IntPointEb"] = Module["asm"]["Mh"]).apply(null, arguments)
};
var __ZN4cura8Polygons24addPolyTreeNodeRecursiveERKN10ClipperLib8PolyNodeE = Module["__ZN4cura8Polygons24addPolyTreeNodeRecursiveERKN10ClipperLib8PolyNodeE"] = function () {
    return (__ZN4cura8Polygons24addPolyTreeNodeRecursiveERKN10ClipperLib8PolyNodeE = Module["__ZN4cura8Polygons24addPolyTreeNodeRecursiveERKN10ClipperLib8PolyNodeE"] = Module["asm"]["Nh"]).apply(null, arguments)
};
var __ZN4cura10PolygonRef11applyMatrixERKNS_11PointMatrixE = Module["__ZN4cura10PolygonRef11applyMatrixERKNS_11PointMatrixE"] = function () {
    return (__ZN4cura10PolygonRef11applyMatrixERKNS_11PointMatrixE = Module["__ZN4cura10PolygonRef11applyMatrixERKNS_11PointMatrixE"] = Module["asm"]["Oh"]).apply(null, arguments)
};
var __ZN4cura10PolygonRef11applyMatrixERKNS_12Point3MatrixE = Module["__ZN4cura10PolygonRef11applyMatrixERKNS_12Point3MatrixE"] = function () {
    return (__ZN4cura10PolygonRef11applyMatrixERKNS_12Point3MatrixE = Module["__ZN4cura10PolygonRef11applyMatrixERKNS_12Point3MatrixE"] = Module["asm"]["Ph"]).apply(null, arguments)
};
var __ZNK4cura8Polygons36removeEmptyHoles_processPolyTreeNodeERKN10ClipperLib8PolyNodeEbRS0_ = Module["__ZNK4cura8Polygons36removeEmptyHoles_processPolyTreeNodeERKN10ClipperLib8PolyNodeEbRS0_"] = function () {
    return (__ZNK4cura8Polygons36removeEmptyHoles_processPolyTreeNodeERKN10ClipperLib8PolyNodeEbRS0_ = Module["__ZNK4cura8Polygons36removeEmptyHoles_processPolyTreeNodeERKN10ClipperLib8PolyNodeEbRS0_"] = Module["asm"]["Qh"]).apply(null, arguments)
};
var __ZN4cura15ConstPolygonRef21smooth_corner_complexEN10ClipperLib8IntPointERNS_10ListPolyItES4_x = Module["__ZN4cura15ConstPolygonRef21smooth_corner_complexEN10ClipperLib8IntPointERNS_10ListPolyItES4_x"] = function () {
    return (__ZN4cura15ConstPolygonRef21smooth_corner_complexEN10ClipperLib8IntPointERNS_10ListPolyItES4_x = Module["__ZN4cura15ConstPolygonRef21smooth_corner_complexEN10ClipperLib8IntPointERNS_10ListPolyItES4_x"] = Module["asm"]["Rh"]).apply(null, arguments)
};
var __ZN4cura15ConstPolygonRef19smooth_outward_stepEN10ClipperLib8IntPointExRNS_10ListPolyItES4_RbS5_S5_S5_ = Module["__ZN4cura15ConstPolygonRef19smooth_outward_stepEN10ClipperLib8IntPointExRNS_10ListPolyItES4_RbS5_S5_S5_"] = function () {
    return (__ZN4cura15ConstPolygonRef19smooth_outward_stepEN10ClipperLib8IntPointExRNS_10ListPolyItES4_RbS5_S5_S5_ = Module["__ZN4cura15ConstPolygonRef19smooth_outward_stepEN10ClipperLib8IntPointExRNS_10ListPolyItES4_RbS5_S5_S5_"] = Module["asm"]["Sh"]).apply(null, arguments)
};
var __ZN4cura15ConstPolygonRef20smooth_corner_simpleEN10ClipperLib8IntPointES2_S2_NS_10ListPolyItES3_S3_S2_S2_S2_xf = Module["__ZN4cura15ConstPolygonRef20smooth_corner_simpleEN10ClipperLib8IntPointES2_S2_NS_10ListPolyItES3_S3_S2_S2_S2_xf"] = function () {
    return (__ZN4cura15ConstPolygonRef20smooth_corner_simpleEN10ClipperLib8IntPointES2_S2_NS_10ListPolyItES3_S3_S2_S2_S2_xf = Module["__ZN4cura15ConstPolygonRef20smooth_corner_simpleEN10ClipperLib8IntPointES2_S2_NS_10ListPolyItES3_S3_S2_S2_S2_xf"] = Module["asm"]["Th"]).apply(null, arguments)
};
var __ZNK4cura15ConstPolygonRef6smoothEiNS_10PolygonRefE = Module["__ZNK4cura15ConstPolygonRef6smoothEiNS_10PolygonRefE"] = function () {
    return (__ZNK4cura15ConstPolygonRef6smoothEiNS_10PolygonRefE = Module["__ZNK4cura15ConstPolygonRef6smoothEiNS_10PolygonRefE"] = Module["asm"]["Uh"]).apply(null, arguments)
};
var __ZNK4cura15ConstPolygonRef7smooth2EiNS_10PolygonRefE = Module["__ZNK4cura15ConstPolygonRef7smooth2EiNS_10PolygonRefE"] = function () {
    return (__ZNK4cura15ConstPolygonRef7smooth2EiNS_10PolygonRefE = Module["__ZNK4cura15ConstPolygonRef7smooth2EiNS_10PolygonRefE"] = Module["asm"]["Vh"]).apply(null, arguments)
};
var __ZNK4cura8Polygons34splitIntoParts_processPolyTreeNodeEPN10ClipperLib8PolyNodeERNSt3__26vectorINS_12PolygonsPartENS4_9allocatorIS6_EEEE = Module["__ZNK4cura8Polygons34splitIntoParts_processPolyTreeNodeEPN10ClipperLib8PolyNodeERNSt3__26vectorINS_12PolygonsPartENS4_9allocatorIS6_EEEE"] = function () {
    return (__ZNK4cura8Polygons34splitIntoParts_processPolyTreeNodeEPN10ClipperLib8PolyNodeERNSt3__26vectorINS_12PolygonsPartENS4_9allocatorIS6_EEEE = Module["__ZNK4cura8Polygons34splitIntoParts_processPolyTreeNodeEPN10ClipperLib8PolyNodeERNSt3__26vectorINS_12PolygonsPartENS4_9allocatorIS6_EEEE"] = Module["asm"]["Wh"]).apply(null, arguments)
};
var __ZNK4cura8Polygons38splitIntoPartsView_processPolyTreeNodeERNS_9PartsViewERS0_PN10ClipperLib8PolyNodeE = Module["__ZNK4cura8Polygons38splitIntoPartsView_processPolyTreeNodeERNS_9PartsViewERS0_PN10ClipperLib8PolyNodeE"] = function () {
    return (__ZNK4cura8Polygons38splitIntoPartsView_processPolyTreeNodeERNS_9PartsViewERS0_PN10ClipperLib8PolyNodeE = Module["__ZNK4cura8Polygons38splitIntoPartsView_processPolyTreeNodeERNS_9PartsViewERS0_PN10ClipperLib8PolyNodeE"] = Module["asm"]["Xh"]).apply(null, arguments)
};
var __ZNK4cura3SVG8getScaleEv = Module["__ZNK4cura3SVG8getScaleEv"] = function () {
    return (__ZNK4cura3SVG8getScaleEv = Module["__ZNK4cura3SVG8getScaleEv"] = Module["asm"]["Yh"]).apply(null, arguments)
};
var __ZN4cura3SVG12writeCommentENSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE = Module["__ZN4cura3SVG12writeCommentENSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE"] = function () {
    return (__ZN4cura3SVG12writeCommentENSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE = Module["__ZN4cura3SVG12writeCommentENSt3__212basic_stringIcNS1_11char_traitsIcEENS1_9allocatorIcEEEE"] = Module["asm"]["Zh"]).apply(null, arguments)
};
var __ZN4cura3SVG10writeAreasENS_15ConstPolygonRefENS0_5ColorES2_f = Module["__ZN4cura3SVG10writeAreasENS_15ConstPolygonRefENS0_5ColorES2_f"] = function () {
    return (__ZN4cura3SVG10writeAreasENS_15ConstPolygonRefENS0_5ColorES2_f = Module["__ZN4cura3SVG10writeAreasENS_15ConstPolygonRefENS0_5ColorES2_f"] = Module["asm"]["_h"]).apply(null, arguments)
};
var __ZN4cura3SVG11writePointsENS_15ConstPolygonRefEbiNS0_5ColorE = Module["__ZN4cura3SVG11writePointsENS_15ConstPolygonRefEbiNS0_5ColorE"] = function () {
    return (__ZN4cura3SVG11writePointsENS_15ConstPolygonRefEbiNS0_5ColorE = Module["__ZN4cura3SVG11writePointsENS_15ConstPolygonRefEbiNS0_5ColorE"] = Module["asm"]["$h"]).apply(null, arguments)
};
var __ZN4cura3SVG11writePointsERNS_8PolygonsEbiNS0_5ColorE = Module["__ZN4cura3SVG11writePointsERNS_8PolygonsEbiNS0_5ColorE"] = function () {
    return (__ZN4cura3SVG11writePointsERNS_8PolygonsEbiNS0_5ColorE = Module["__ZN4cura3SVG11writePointsERNS_8PolygonsEbiNS0_5ColorE"] = Module["asm"]["ai"]).apply(null, arguments)
};
var __ZN4cura3SVG10writeLinesENSt3__26vectorIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEENS0_5ColorE = Module["__ZN4cura3SVG10writeLinesENSt3__26vectorIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEENS0_5ColorE"] = function () {
    return (__ZN4cura3SVG10writeLinesENSt3__26vectorIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEENS0_5ColorE = Module["__ZN4cura3SVG10writeLinesENSt3__26vectorIN10ClipperLib8IntPointENS1_9allocatorIS4_EEEENS0_5ColorE"] = Module["asm"]["bi"]).apply(null, arguments)
};
var __ZN4cura3SVG12writeLineRGBERKN10ClipperLib8IntPointES4_iiif = Module["__ZN4cura3SVG12writeLineRGBERKN10ClipperLib8IntPointES4_iiif"] = function () {
    return (__ZN4cura3SVG12writeLineRGBERKN10ClipperLib8IntPointES4_iiif = Module["__ZN4cura3SVG12writeLineRGBERKN10ClipperLib8IntPointES4_iiif"] = Module["asm"]["ci"]).apply(null, arguments)
};
var __ZN4cura3SVG15writeDashedLineERKN10ClipperLib8IntPointES4_NS0_5ColorE = Module["__ZN4cura3SVG15writeDashedLineERKN10ClipperLib8IntPointES4_NS0_5ColorE"] = function () {
    return (__ZN4cura3SVG15writeDashedLineERKN10ClipperLib8IntPointES4_NS0_5ColorE = Module["__ZN4cura3SVG15writeDashedLineERKN10ClipperLib8IntPointES4_NS0_5ColorE"] = Module["asm"]["di"]).apply(null, arguments)
};
var __ZN4cura3SVG9writeTextEN10ClipperLib8IntPointENSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEENS0_5ColorEx = Module["__ZN4cura3SVG9writeTextEN10ClipperLib8IntPointENSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEENS0_5ColorEx"] = function () {
    return (__ZN4cura3SVG9writeTextEN10ClipperLib8IntPointENSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEENS0_5ColorEx = Module["__ZN4cura3SVG9writeTextEN10ClipperLib8IntPointENSt3__212basic_stringIcNS3_11char_traitsIcEENS3_9allocatorIcEEEENS0_5ColorEx"] = Module["asm"]["ei"]).apply(null, arguments)
};
var __ZN4cura3SVG13writePolygonsERKNS_8PolygonsENS0_5ColorEf = Module["__ZN4cura3SVG13writePolygonsERKNS_8PolygonsENS0_5ColorEf"] = function () {
    return (__ZN4cura3SVG13writePolygonsERKNS_8PolygonsENS0_5ColorEf = Module["__ZN4cura3SVG13writePolygonsERKNS_8PolygonsENS0_5ColorEf"] = Module["asm"]["fi"]).apply(null, arguments)
};
var stackAlloc = Module["stackAlloc"] = function () {
    return (stackAlloc = Module["stackAlloc"] = Module["asm"]["gi"]).apply(null, arguments)
};
var calledRun;

function ExitStatus(status) {
    this.name = "ExitStatus";
    this.message = "Program terminated with exit(" + status + ")";
    this.status = status
}
var calledMain = false;
dependenciesFulfilled = function runCaller() {
    if (!calledRun) run();
    if (!calledRun) dependenciesFulfilled = runCaller
};

function callMain(args) {
    var entryFunction = Module["_main"];
    args = args || [];
    var argc = args.length + 1;
    var argv = stackAlloc((argc + 1) * 4);
    HEAP32[argv >> 2] = allocateUTF8OnStack(thisProgram);
    for (var i = 1; i < argc; i++) {
        HEAP32[(argv >> 2) + i] = allocateUTF8OnStack(args[i - 1])
    }
    HEAP32[(argv >> 2) + argc] = 0;
    try {
        var ret = entryFunction(argc, argv);
        exit(ret, true);
        return ret
    } catch (e) {
        return handleException(e)
    } finally {
        calledMain = true
    }
}

function run(args) {
    args = args || arguments_;
    if (runDependencies > 0) {
        return
    }
    preRun();
    if (runDependencies > 0) {
        return
    }

    function doRun() {
        if (calledRun) return;
        calledRun = true;
        Module["calledRun"] = true;
        if (ABORT) return;
        initRuntime();
        preMain();
        if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
        if (shouldRunNow) callMain(args);
        postRun()
    }
    if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(function () {
            setTimeout(function () {
                Module["setStatus"]("")
            }, 1);
            doRun()
        }, 1)
    } else {
        doRun()
    }
}
Module["run"] = run;

function exit(status, implicit) {
    EXITSTATUS = status;
    if (keepRuntimeAlive()) {} else {
        exitRuntime()
    }
    procExit(status)
}

function procExit(code) {
    EXITSTATUS = code;
    if (!keepRuntimeAlive()) {
        if (Module["onExit"]) Module["onExit"](code);
        ABORT = true
    }
    quit_(code, new ExitStatus(code))
}
if (Module["preInit"]) {
    if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
    while (Module["preInit"].length > 0) {
        Module["preInit"].pop()()
    }
}
var shouldRunNow = true;
if (Module["noInitialRun"]) shouldRunNow = false;
run();