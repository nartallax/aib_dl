(
function imploderLoader(defs, params, evl) {
    "use strict";
    var req = typeof (require) !== "undefined" ? require : function () { throw new Error("External require() function is not defined! Could not load any external module."); };
    function handleError(e, action) {
        var handler = params.errorHandler;
        if (handler) {
            handler(e, action);
        }
        else {
            console.error((action ? "Error during " + action + ": " : "") + (e.stack || e.message || e));
        }
        throw e;
    }
    // разбираем полученный массив определений
    var renames = {};
    var defMap = {};
    for (var i = 0; i < defs.length; i++) {
        var v = defs[i];
        var m = typeof (v[2]) !== "string" ? v[2] : undefined;
        var def = m ? m : {};
        def.name = v[0];
        def.code = v[v.length - 1];
        if (m && m.altName) {
            renames[m.altName] = def.name;
        }
        def.dependencies = Array.isArray(v[1]) ? v[1] : [];
        defMap[def.name] = def;
    }
    var amd = typeof (define) === "function" && !!define.amd;
    /** функция, которую будут дергать в качестве require изнутри модулей */
    function requireAny(names, onOk, onError) {
        if (!onOk) {
            // дернуты как commonjs, т.е. синхронно с одним именем
            var name_1 = names;
            if (name_1 in defMap) {
                return getProduct(name_1);
            }
            else {
                // тут мы просто надеемся, что человек, который пишет код - не дурак
                // и знает, в каком окружении он будет запускаться
                // и поэтому просто дергаем require как commonjs синхронный require
                return req(name_1);
            }
        }
        else {
            // дернуты как amd
            var callError = function (e) {
                if (onError) {
                    onError(e);
                }
                else {
                    handleError(e);
                }
            };
            try {
                var nameArr = Array.isArray(names) ? names : [names];
                var resultArr_1 = [];
                var nameIndex_1 = {};
                var externalNameArr_1 = nameArr.filter(function (name, index) {
                    nameIndex_1[name] = index;
                    if (name in defMap) {
                        resultArr_1[index] = getProduct(name);
                        return false;
                    }
                    return true;
                });
                if (externalNameArr_1.length === 0) {
                    return onOk.apply(null, resultArr_1);
                }
                else {
                    if (amd) {
                        return req(externalNameArr_1, function (externalResults) {
                            for (var i = 0; i < externalNameArr_1.length; i++) {
                                resultArr_1[nameIndex_1[externalNameArr_1[i]]] = externalResults[i];
                            }
                            onOk.apply(null, resultArr_1);
                        }, onError);
                    }
                    else {
                        // если у нас запросили модули асинхронно, но при этом у нас есть только синрохнный commonjs-овый require - 
                        // то используем его, чего еще делать
                        externalNameArr_1.forEach(function (name) { return resultArr_1[nameIndex_1[name]] = req(name); });
                        onOk.apply(null, resultArr_1);
                    }
                }
            }
            catch (e) {
                callError(e);
            }
        }
    }
    var currentlyDefiningProductMap = {};
    var currentlyDefiningProductSeq = [];
    var products = {};
    function throwCircularDependencyError(name) {
        if (currentlyDefiningProductSeq.length === 1 &&
            currentlyDefiningProductSeq[0] === name) {
            throw new Error("Module imports itself: " + name + ". It's not clear what exactly do you want.");
        }
        var str = name;
        for (var i = currentlyDefiningProductSeq.length - 1; i >= 0; i--) {
            var n = currentlyDefiningProductSeq[i];
            str += " <- " + currentlyDefiningProductSeq[i];
            if (n === name)
                break;
        }
        throw new Error("Unresolvable circular dependency detected: " + str);
    }
    function getProduct(name) {
        name = renames[name] || name;
        var meta = defMap[name];
        if (!(name in products)) {
            if (name in currentlyDefiningProductMap) {
                throwCircularDependencyError(name);
            }
            currentlyDefiningProductMap[name] = true;
            currentlyDefiningProductSeq.push(name);
            try {
                var product = {};
                var deps_1 = [product, requireAny];
                meta.dependencies.forEach(function (name) {
                    if (name in renames) {
                        name = renames[name];
                    }
                    var product = products[name];
                    if (product) {
                        deps_1.push(product);
                        return;
                    }
                    var depMeta = defMap[name];
                    if (!depMeta) {
                        throw new Error("Failed to get module \"" + name + "\": no definition is known and no preloaded external module is present.");
                    }
                    deps_1.push(depMeta.arbitraryType || (!depMeta.exports && !depMeta.exportRefs) ? getProduct(name) : getProxy(depMeta));
                });
                var fullCode = meta.code;
                if (meta.nonModule) {
                    fullCode = "function(){" + fullCode + "}";
                }
                fullCode = "'use strict';(" + fullCode + ")\n//# sourceURL=" + meta.name;
                var defFunc = evl(fullCode);
                var returnProduct = defFunc.apply(null, deps_1);
                if (meta.arbitraryType) {
                    product = returnProduct;
                }
                products[name] = product;
            }
            finally {
                delete currentlyDefiningProductMap[name];
                currentlyDefiningProductSeq.pop();
            }
        }
        return products[name];
    }
    var proxies = {};
    function getProxy(def) {
        if (!(def.name in proxies)) {
            var proxy_1 = {};
            getAllExportNames(def).forEach(function (arr) {
                arr.forEach(function (name) {
                    defineProxyProp(def, proxy_1, name);
                });
            });
            proxies[def.name] = proxy_1;
        }
        return proxies[def.name];
    }
    function getAllExportNames(meta, result, noDefault) {
        if (result === void 0) { result = []; }
        if (noDefault === void 0) { noDefault = false; }
        if (meta.exports) {
            if (noDefault) {
                result.push(meta.exports.filter(function (_) { return _ !== "default"; }));
            }
            else {
                result.push(meta.exports);
            }
        }
        if (meta.exportRefs) {
            meta.exportRefs.forEach(function (ref) {
                // тут, теоретически, могла бы возникнуть бесконечная рекурсия
                // но не возникнет, еще при компиляции есть проверка
                if (ref in defMap) {
                    getAllExportNames(defMap[ref], result, true);
                }
                else if (ref in products) {
                    // модуля может не быть, если он внешний и в бандл не вошел
                    result.push(Object.keys(products[ref]));
                }
                else {
                    // такого по идее произойти не должно никогда, т.к. оно упадет раньше
                    // еще на этапе подгрузки внешних модулей
                    throw new Error("External module " + ref + " is not loaded at required time.");
                }
            });
        }
        return result;
    }
    function defineProxyProp(meta, proxy, name) {
        if (proxy.hasOwnProperty(name)) {
            return;
        }
        Object.defineProperty(proxy, name, {
            get: function () { return getProduct(meta.name)[name]; },
            set: function (v) { return getProduct(meta.name)[name] = v; },
            enumerable: true
        });
    }
    function discoverExternalModules(result) {
        if (result === void 0) { result = {}; }
        for (var moduleName in defMap) {
            defMap[moduleName].dependencies.forEach(function (dep) {
                if (!(dep in defMap)) {
                    result[dep] = true;
                }
            });
        }
        return Object.keys(result).sort();
    }
    function afterExternalsLoaded() {
        var mainProduct = getProduct(params.entryPoint.module);
        // инициализируем все модули в бандле, ради сайд-эффектов
        Object.keys(defMap).forEach(function (name) {
            if (!(name in products)) {
                getProduct(name);
            }
        });
        var err = null;
        if (params.entryPoint.function) {
            try {
                mainProduct[params.entryPoint.function].apply(null, params.entryPointArgs || []);
            }
            catch (e) {
                err = e;
            }
        }
        if (err) {
            handleError(err);
        }
        if (typeof (module) === "object" && module.exports) {
            module.exports = mainProduct;
        }
        return mainProduct;
    }
    function start() {
        if (amd) {
            var externalModuleNames_1 = discoverExternalModules({ "require": true });
            define(externalModuleNames_1, function (require) {
                req = require;
                for (var i = externalModuleNames_1.length; i < arguments.length; i++) {
                    products[externalModuleNames_1[i]] = arguments[i];
                }
                return afterExternalsLoaded();
            });
        }
        else {
            var externalModuleNames_2 = discoverExternalModules();
            requireAny(externalModuleNames_2, function () {
                for (var i = 0; i < arguments.length; i++) {
                    products[externalModuleNames_2[i]] = arguments[i];
                }
                afterExternalsLoaded();
            });
        }
    }
    start();
})(

[["/cli",["/log"],"function (exports, require, log_1) {\n    class CLI {\n        constructor(params) {\n            this.params = params;\n        }\n        static get processArgvWithoutExecutables() {\n            return process.argv.slice(2);\n        }\n        static defaultHelpPrinter(lines) {\n            lines.forEach(line => console.log(line));\n            return process.exit(1);\n        }\n        static printErrorAndExit(error) {\n            (0, log_1.log)(error.message);\n            process.exit(1);\n        }\n        static str(params) {\n            return {\n                default: params.default,\n                keys: Array.isArray(params.keys) ? params.keys : [params.keys],\n                allowedValues: params.allowedValues,\n                definition: params.definition,\n                type: \"string\"\n            };\n        }\n        static bool(params) {\n            return {\n                default: false,\n                keys: Array.isArray(params.keys) ? params.keys : [params.keys],\n                definition: params.definition,\n                type: \"bool\"\n            };\n        }\n        static help(params) {\n            return {\n                default: false,\n                keys: Array.isArray(params.keys) ? params.keys : [params.keys],\n                definition: params.definition,\n                isHelp: true,\n                type: \"bool\"\n            };\n        }\n        static double(params) {\n            return {\n                default: params.default,\n                keys: Array.isArray(params.keys) ? params.keys : [params.keys],\n                allowedValues: params.allowedValues,\n                definition: params.definition,\n                type: \"double\"\n            };\n        }\n        static int(params) {\n            return {\n                default: params.default,\n                keys: Array.isArray(params.keys) ? params.keys : [params.keys],\n                allowedValues: params.allowedValues,\n                definition: params.definition,\n                type: \"int\"\n            };\n        }\n        fail(msg) {\n            return (this.params.onError || CLI.printErrorAndExit)(new Error(msg));\n        }\n        printHelp() {\n            let helpLines = this.params.helpHeader ? [this.params.helpHeader] : [];\n            let argNames = Object.keys(this.params.definition);\n            let keyPart = (argName) => {\n                let def = this.params.definition[argName];\n                return def.keys.join(\", \") + \" (\" + def.type + \")\";\n            };\n            let maxKeyLength = argNames.map(argName => keyPart(argName).length).reduce((a, b) => Math.max(a, b), 0);\n            argNames.forEach(argName => {\n                let def = this.params.definition[argName];\n                let line = keyPart(argName);\n                while (line.length < maxKeyLength) {\n                    line += \" \";\n                }\n                if (def.definition) {\n                    line += \": \" + def.definition;\n                }\n                if (def.allowedValues) {\n                    line += \" Allowed values: \" + def.allowedValues.join(\", \") + \".\";\n                }\n                helpLines.push(line);\n            });\n            (this.params.showHelp || CLI.defaultHelpPrinter)(helpLines);\n        }\n        buildKeysMap() {\n            let result = new Map();\n            Object.keys(this.params.definition).forEach(argName => {\n                let keys = this.params.definition[argName].keys;\n                if (keys.length === 0) {\n                    this.fail(\"CLI argument \\\"\" + argName + \"\\\" has no keys with which it could be passed.\");\n                }\n                keys.forEach(key => {\n                    if (result.has(key)) {\n                        this.fail(\"CLI argument key \\\"\" + key + \"\\\" is bound to more than one argument: \\\"\" + argName + \"\\\", \\\"\" + result.get(key) + \"\\\".\");\n                    }\n                    result.set(key, argName);\n                });\n            });\n            return result;\n        }\n        parseArgs(values = CLI.processArgvWithoutExecutables) {\n            let result = this.extract(values);\n            let haveHelp = false;\n            let abstentMandatories = [];\n            Object.keys(this.params.definition).forEach(argName => {\n                let def = this.params.definition[argName];\n                if (def.isHelp && !!result[argName]) {\n                    haveHelp = true;\n                }\n                if (argName in result) {\n                    if (def.allowedValues) {\n                        let s = new Set(def.allowedValues);\n                        if (!s.has(result[argName])) {\n                            this.fail(\"Value of CLI argument \\\"\" + argName + \"\\\" is not in allowed values set: it's \\\"\" + result[argName] + \", while allowed values are \" + def.allowedValues.map(x => \"\\\"\" + x + \"\\\"\").join(\", \"));\n                        }\n                    }\n                    return;\n                }\n                if (def.default !== undefined) {\n                    result[argName] = def.default;\n                }\n                else {\n                    abstentMandatories.push(argName);\n                }\n            });\n            if (haveHelp) {\n                this.printHelp();\n            }\n            if (abstentMandatories.length > 0) {\n                this.fail(\"Some mandatory CLI arguments are absent: \" + abstentMandatories.map(x => \"\\\"\" + x + \"\\\"\").join(\", \"));\n            }\n            return result;\n        }\n        extract(values) {\n            let knownArguments = new Set();\n            let keyToArgNameMap = this.buildKeysMap();\n            let result = {};\n            for (let i = 0; i < values.length; i++) {\n                let v = values[i];\n                if (!keyToArgNameMap.has(v)) {\n                    this.fail(\"Unknown CLI argument key: \\\"\" + v + \"\\\".\");\n                }\n                let argName = keyToArgNameMap.get(v);\n                if (knownArguments.has(argName)) {\n                    this.fail(\"CLI argument \\\"\" + argName + \"\\\" passed more than once, last time with key \\\"\" + v + \"\\\".\");\n                }\n                knownArguments.add(argName);\n                let def = this.params.definition[argName];\n                let actualValue;\n                switch (def.type) {\n                    case \"bool\":\n                        actualValue = true;\n                        break;\n                    case \"string\":\n                    case \"int\":\n                    case \"double\":\n                        if (i === values.length - 1) {\n                            this.fail(\"Expected to have some value after CLI key \\\"\" + v + \"\\\".\");\n                        }\n                        i++;\n                        actualValue = values[i];\n                        if (def.type === \"int\" || def.type === \"double\") {\n                            let num = parseFloat(actualValue);\n                            if (!Number.isFinite(num)) {\n                                this.fail(\"Expected to have number after CLI key \\\"\" + v + \"\\\", got \\\"\" + actualValue + \"\\\" instead.\");\n                            }\n                            if (def.type === \"int\" && (num % 1) !== 0) {\n                                this.fail(\"Expected to have integer number after CLI key \\\"\" + v + \"\\\", got \\\"\" + actualValue + \"\\\" instead (it's fractional).\");\n                            }\n                            actualValue = num;\n                        }\n                }\n                result[argName] = actualValue;\n            }\n            return result;\n        }\n    }\n    exports.CLI = CLI;\n}\n"],["/event",["/log"],"function (exports, require, log_1) {\n    class CompositeEventError extends Error {\n        constructor(nested, event, eventArgs) {\n            super(nested.length + \" error(s) happened during execution of listeners of event\" + (event.eventName ? \" \" + event.eventName : \"\") + \".\");\n            nested.forEach(err => (0, log_1.log)(err.stack || err.message));\n            this.event = event;\n            this.eventArgs = eventArgs;\n            this.nested = nested;\n        }\n    }\n    exports.CompositeEventError = CompositeEventError;\n    class BareEvent {\n        constructor(name) {\n            this.listeners = new Set();\n            this.eventName = name || \"\";\n        }\n        listen(listener) {\n            this.listeners.add(listener);\n        }\n        unlisten(listener) {\n            this.listeners.delete(listener);\n        }\n        hasListeners() {\n            return this.listeners.size > 0;\n        }\n        wait() {\n            return new Promise(ok => {\n                let listener = () => {\n                    this.unlisten(listener);\n                    ok();\n                };\n                this.listen(listener);\n            });\n        }\n        async fire(arg) {\n            let errors = (await Promise.all([...this.listeners].map(async (listener) => {\n                try {\n                    await Promise.resolve(listener(arg));\n                    return null;\n                }\n                catch (e) {\n                    return e;\n                }\n            }))).filter(x => !!x);\n            if (errors.length > 0) {\n                throw new CompositeEventError(errors, this, arg);\n            }\n        }\n    }\n    exports.BareEvent = BareEvent;\n    function Event(name) {\n        let fn = function (newListener) {\n            fnn.listen(newListener);\n        };\n        let bare = new BareEvent(name);\n        let fnn = Object.assign(fn, bare);\n        let copiedFnNames = [\"listen\", \"unlisten\", \"hasListeners\", \"fire\", \"wait\"];\n        copiedFnNames.forEach(fnName => {\n            fnn[fnName] = bare[fnName];\n        });\n        return fnn;\n    }\n    exports.Event = Event;\n}\n"],["/http_client",["http","https","/log","/rps_limiter"],"function (exports, require, Http, Https, log_1, rps_limiter_1) {\n    class HttpClient {\n        constructor(cookies, rootUrl, timeout, retryCount, rpsLimit) {\n            this.cookies = cookies;\n            this.rootUrl = rootUrl;\n            this.timeout = timeout;\n            this.retryCount = retryCount;\n            this.rpsLimiter = new rps_limiter_1.RpsLimiter(rpsLimit);\n        }\n        async get(url) {\n            let tryLevel = 1;\n            while (true) {\n                await this.rpsLimiter.waitPermissionForRequest();\n                try {\n                    return await this.getWithoutRequestCount(url);\n                }\n                catch (e) {\n                    if (tryLevel >= this.retryCount || !(e instanceof Error)) {\n                        throw e;\n                    }\n                    (0, log_1.log)(\"Failed to load \" + url + \": \" + e.message + \". Will retry \" + (this.retryCount - tryLevel) + \" more time(s)\");\n                    tryLevel++;\n                }\n            }\n        }\n        getWithoutRequestCount(urlString) {\n            return new Promise((ok, bad) => {\n                void ok;\n                try {\n                    let url = new URL(urlString, this.rootUrl);\n                    let lib = url.protocol.toLowerCase().startsWith(\"https\") ? Https : Http;\n                    let headers = {};\n                    if (this.cookies) {\n                        headers[\"Cookie\"] = this.cookies;\n                    }\n                    let req = lib.request({\n                        host: url.host,\n                        username: url.username,\n                        password: url.password,\n                        path: url.pathname,\n                        search: url.search,\n                        headers, timeout: this.timeout\n                    });\n                    req.on(\"response\", resp => {\n                        if (!resp.statusCode || resp.statusCode !== 200) {\n                            bad(\"Bad HTTP code (\" + resp.statusCode + \") for URL \" + urlString);\n                            return;\n                        }\n                        try {\n                            let chunks = [];\n                            let len = 0;\n                            resp.on(\"data\", (data) => {\n                                chunks.push(data);\n                                len += data.length;\n                            });\n                            resp.on(\"end\", () => {\n                                ok(Buffer.concat(chunks, len));\n                            });\n                            resp.on(\"error\", e => bad(e));\n                        }\n                        catch (e) {\n                            bad(e);\n                        }\n                    });\n                    req.on(\"error\", e => bad(e));\n                    req.end();\n                }\n                catch (e) {\n                    bad(e);\n                }\n            });\n        }\n    }\n    exports.HttpClient = HttpClient;\n}\n"],["/log","function (exports, require) {\n    function twoDigits(n) {\n        return n > 9 ? n + \"\" : \"0\" + n;\n    }\n    function threeDigits(n) {\n        return n > 99 ? n + \"\" : \"0\" + twoDigits(n);\n    }\n    function dateFmt(inner) {\n        return d => (d && (d instanceof Date)) ? inner(d) : \"\";\n    }\n    exports.localDate = dateFmt((d) => d.getFullYear() + \".\" + twoDigits(d.getMonth() + 1) + \".\" + twoDigits(d.getDate()));\n    exports.localTimeHours = dateFmt((d) => twoDigits(d.getHours()));\n    exports.localTimeMinutes = dateFmt((d) => (0, exports.localTimeHours)(d) + \":\" + twoDigits(d.getMinutes()));\n    exports.localTimeSeconds = dateFmt((d) => (0, exports.localTimeMinutes)(d) + \":\" + twoDigits(d.getSeconds()));\n    exports.localTimeMilliseconds = dateFmt((d) => (0, exports.localTimeSeconds)(d) + \":\" + threeDigits(d.getMilliseconds()));\n    exports.localTimeToHours = dateFmt((d) => (0, exports.localDate)(d) + \" \" + (0, exports.localTimeHours)(d));\n    exports.localTimeToMinutes = dateFmt((d) => (0, exports.localDate)(d) + \" \" + (0, exports.localTimeMinutes)(d));\n    exports.localTimeToSeconds = dateFmt((d) => (0, exports.localDate)(d) + \" \" + (0, exports.localTimeSeconds)(d));\n    exports.localTimeToMilliseconds = dateFmt((d) => (0, exports.localDate)(d) + \" \" + (0, exports.localTimeMilliseconds)(d));\n    function log(v) {\n        let str = v + \"\\n\";\n        str = (0, exports.localTimeToMilliseconds)(new Date()) + \" | \" + str;\n        process.stderr.write(str);\n    }\n    exports.log = log;\n}\n"],["/main",["/cli","/http_client","cheerio","/log","/parallel_executor","fs","path"],"function (exports, require, cli_1, http_client_1, Cheerio, log_1, parallel_executor_1, fs_1, Path) {\n    let cliArgs = new cli_1.CLI({\n        helpHeader: \"A tool to download images from anonymous imageboard threads\",\n        definition: {\n            url: cli_1.CLI.str({ keys: \"--url\", definition: \"URL of thread you want to download from\" }),\n            outDir: cli_1.CLI.str({ keys: \"--out-dir\", definition: \"Path to directory to place images into\" }),\n            cookies: cli_1.CLI.str({ keys: \"--cookies\", definition: \"Cookie header content. May be required to download from some places\", default: \"\" }),\n            linkCssExpression: cli_1.CLI.str({ keys: \"--css\", definition: \"CSS selector that points to all the DOM nodes that we need to extract images from\" }),\n            domAttributeName: cli_1.CLI.str({ keys: \"--attribute\", definition: \"Name of attribute that contains URL of picture\" }),\n            requestTimeout: cli_1.CLI.double({ keys: \"--request-timeout\", definition: \"How long to wait before request retry, seconds\", default: 180 }),\n            downloadThreads: cli_1.CLI.double({ keys: \"--download-threads\", definition: \"How many simultaneous requests are allowed to run\", default: 3 }),\n            rps: cli_1.CLI.double({ keys: \"--rps\", definition: \"How many requests per second is allowed max\", default: 1 }),\n            retryCount: cli_1.CLI.int({ keys: \"--retry\", definition: \"How many retries are allowed for a single URL before give-up\", default: 3 }),\n            failFast: cli_1.CLI.bool({ keys: \"--fail-fast\", definition: \"If passed, first completely failed URL will also terminate the process\" }),\n            help: cli_1.CLI.help({ keys: [\"--help\", \"-help\", \"-h\", \"--h\"], definition: \"Display help and exit.\" })\n        }\n    }).parseArgs();\n    async function main() {\n        try {\n            await nestedMain();\n        }\n        catch (e) {\n            (0, log_1.log)(e instanceof Error ? e.stack || e.message : e + \"\");\n            process.exit(1);\n        }\n    }\n    exports.main = main;\n    async function nestedMain() {\n        let startTime = Date.now();\n        let httpClient = new http_client_1.HttpClient(cliArgs.cookies, cliArgs.url, cliArgs.requestTimeout, cliArgs.retryCount, cliArgs.rps);\n        let links = extractLinks((await httpClient.get(cliArgs.url)).toString(\"utf-8\"));\n        await fs_1.promises.mkdir(cliArgs.outDir, { recursive: true });\n        let successCount = 0;\n        let skipCount = 0;\n        let totalBytesDownloaded = 0;\n        await new parallel_executor_1.ParallelExecutor(cliArgs.downloadThreads).asyncMap(links, async (link, index) => {\n            let fname = makeFilename(link, index);\n            let fullFname = Path.resolve(cliArgs.outDir, fname);\n            try {\n                await fs_1.promises.stat(fullFname);\n                (0, log_1.log)(`Skipping ${link}: file ${fname} already exists.`);\n                skipCount++;\n                return;\n            }\n            catch (e) {\n                if (!(e instanceof Error) || !(\"code\" in e) || e.code !== \"ENOENT\") {\n                    throw e;\n                }\n            }\n            let data = await httpClient.get(link);\n            await fs_1.promises.writeFile(fullFname, data);\n            totalBytesDownloaded += data.length;\n            successCount++;\n            (0, log_1.log)(`Downloaded ${link} into ${fname}: ${formatBytes(data.length)}`);\n        }, (e, link) => {\n            if (cliArgs.failFast) {\n                (0, log_1.log)(`Completely failed to download ${link}: ${e.message}. Exiting.`);\n                process.exit(1);\n            }\n            else {\n                (0, log_1.log)(`Completely failed to download ${link}: ${e.message}. Won't retry.`);\n            }\n        });\n        let timeSpent = Math.ceil((Date.now() - startTime) / 1000);\n        (0, log_1.log)(`Completed; downloaded ${successCount} out of ${links.length} (skipped ${skipCount}) in ${timeSpent}s, total effective data downloaded: ${formatBytes(totalBytesDownloaded)}, at ${formatBytes(totalBytesDownloaded / timeSpent)}/s`);\n    }\n    let safeUrl = cliArgs.url.replace(/[^a-zA-Z\\d_-]/g, \"_\").replace(/_{2,}/g, \"_\");\n    function makeFilename(link, index) {\n        let ext = (link.match(/([^.]+)$/) || [])[0] || \"\";\n        if (ext) {\n            ext = \".\" + ext;\n        }\n        let indexStr = index + \"\";\n        while (indexStr.length < 7) {\n            indexStr = \"0\" + indexStr;\n        }\n        return safeUrl + \"_\" + indexStr + ext;\n    }\n    let byteSizeNames = [\"\", \"kb\", \"mb\", \"gb\", \"tb\"];\n    function formatBytes(bytes) {\n        let i = 0;\n        while (bytes > 10 * 1024) {\n            bytes /= 1024;\n            i++;\n        }\n        return Math.round(bytes) + byteSizeNames[i];\n    }\n    function extractLinks(html) {\n        let result = [];\n        let dom = Cheerio.load(html);\n        let els = dom(cliArgs.linkCssExpression);\n        (0, log_1.log)(\"Extracted \" + els.length + \" items by CSS expression\");\n        els.each((_, node) => {\n            let el = dom(node);\n            let attrVal = el.attr(cliArgs.domAttributeName);\n            if (typeof (attrVal) === \"string\") {\n                result.push(attrVal);\n            }\n        });\n        (0, log_1.log)(\"Extracted \" + result.length + \" links\");\n        return result;\n    }\n}\n"],["/parallel_executor",["/event","/log"],"function (exports, require, event_1, log_1) {\n    class ParallelExecutor {\n        constructor(limit) {\n            this.limit = limit;\n        }\n        async asyncMap(items, action, onFailure) {\n            let result = [];\n            let completedEvent = (0, event_1.Event)();\n            let execCount = 0;\n            for (let i = 0; i < items.length; i++) {\n                if (execCount >= this.limit) {\n                    await completedEvent.wait();\n                }\n                execCount++;\n                action(items[i], i).then(output => {\n                    result[i] = output;\n                    execCount--;\n                    completedEvent.fire();\n                }, e => {\n                    execCount--;\n                    completedEvent.fire();\n                    if (!(e instanceof Error)) {\n                        (0, log_1.log)(\"wtf: \" + e);\n                    }\n                    onFailure(e, items[i]);\n                });\n            }\n            while (execCount > 0) {\n                await completedEvent.wait();\n            }\n            return result;\n        }\n    }\n    exports.ParallelExecutor = ParallelExecutor;\n}\n"],["/rps_limiter","function (exports, require) {\n    class RpsLimiter {\n        constructor(limit) {\n            this.lastRequestTime = 0;\n            this.msBetweenRequests = 1000 / limit;\n        }\n        async waitPermissionForRequest() {\n            while (true) {\n                let now = Date.now();\n                let timeDiff = now - this.lastRequestTime;\n                if (timeDiff >= this.msBetweenRequests) {\n                    this.lastRequestTime = now;\n                    return;\n                }\n                else {\n                    await new Promise(ok => setTimeout(ok, timeDiff + 1));\n                }\n            }\n        }\n    }\n    exports.RpsLimiter = RpsLimiter;\n}\n"]]
,
{"entryPoint":{"module":"/main","function":"main"}},eval);