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

    setCommand(command) {
        this._command = command;
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
    let mac;
    socket.on('data', data => {
        let obj = JSON.safeParse(data);
        if (obj['type'] === 'init') {
            mac = obj['mac'];
            clients[mac] = new Client(socket, command => {
                socket.write(encodeURI(command) + "\n");
            });
        }
    });

    socket.on('end', () => {
        clients[mac] = undefined;
    })
});

socketServer.listen(8080);

const httpServer = http.createServer((req, res) => {
    let query = url.parse(req.url).query;
    if (query != null && typeof query['mac'] !== "undefined") {
        if (clients[query['mac']] !== undefined) {
            if (typeof query['command'] !== "undefined") {
                clients[query['mac']].setCommand(query['command']);
                res.end("Command set!");
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