const net = require('net');
const http = require('http');
const url = require('url');

class Client {
    constructor(socket, onCommandChange) {
        this.ip = socket.remoteAddress;
        this.port = socket.remotePort;
        this.socket = socket;
        this.onCommandChange = onCommandChange;
    }

    setCommand(command, onComplete) {
        this._command = command;
        this.onComplete = result => {
            onComplete(result);
            this.onComplete = null;
        };
        if (typeof this.onCommandChange === "function") {
            this.onCommandChange(command);
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
    let mac, client;
    socket.on('data', data => {
        console.log(data.toString());
        let obj = JSON.safeParse(data.toString());
        if (obj) {
            if (obj['type'] === 'init') {
                mac = obj['mac'];
                client = clients[mac] = new Client(socket, command => {
                    socket.write(encodeURI(JSON.stringify({
                        type: "command",
                        command: command,
                    })) + "\n");
                });
            } else if (obj['type'] === "result") {
                console.log(obj['result']);
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
    }
});

socketServer.listen(8080);

const httpServer = http.createServer((req, res) => {
    let query = url.parse(req.url, true).query;
    if (query != null && typeof query['mac'] !== "undefined") {
        if (clients[query['mac']] !== undefined) {
            if (typeof query['command'] !== "undefined") {
                clients[query['mac']].setCommand(query['command'], res.end);
            } else {
                res.end("Unknown operation");
            }
        } else {
            res.end('Such mac is not connected');
        }
    } else {
        res.end("fuck you");
    }
});

httpServer.listen(6702);