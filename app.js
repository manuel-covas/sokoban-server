const net = require("net");
const fs = require("fs");

const highscoresDir = "./highscores/";


var socketServer = net.createServer(onConnect);
socketServer.listen(29261);

var clients = {};


function onConnect(socket) {
    socket.on("data", (data) => {onData(data, socket)});
    
    var client = {operation: 0x00, socket: socket, data: Buffer.alloc(2048)}
    clients[socket] = client;
}


function onData(data, socket) {
    var client = clients[socket];

    if (client.operation == 0x00) {
        switch (data[0])
        {
            case 0x01:
                presentScoreboard(client);
                break;
        
            case 0x02:        
                break;

            default:
                break;
        }
    }
}


function presentScoreboard(client) {
    var payload = "";
    var filesLeft = 0;

    fs.readdir(highscoresDir, (err, files) => {
        filesLeft = files.length;

        if (filesLeft == 0) {
            client.socket.write("No scores stored on the server.");
            removeClient(client);
            return;
        }

        files.forEach(fileName => {
            fs.readFile(highscoresDir+fileName, (err, data) => {
                if (!(err)) {
                    payload = payload + fileName + "\n";
                    var indexOfNL = data.indexOf('\n');

                    while (indexOfNL > 0) {
                        var line = data.subarray(0, indexOfNL).toString("utf-8");
                        var entry = line.split(":");
                        data = data.subarray(indexOfNL);

                        if (entry.length == 2) {
                            payload = payload + "    "+entry[0]+": "+entry[1]+" moves\n";
                        }else{
                            payload = payload + "    Invalid score entry: \""+line+"\"\n";
                        }
                        indexOfNL = data.indexOf('\n');
                    }
                    payload = payload + "\n";
                }
                filesLeft--;

                if (filesLeft == 0) {
                    console.log("Served scoreboard to "+client.socket.remoteAddress);
                    client.socket.write(payload);
                    removeClient(client);
                }
            });
        });
    });

}


function removeClient(client) {
    client.socket.end();
    client.socket.destroy();
    delete clients[client.socket];
}