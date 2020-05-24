const crypto = require("crypto");
const net = require("net");
const fs = require("fs");

const highscoresDir = "./highscores/";


var socketServer = net.createServer(onConnect);
socketServer.listen(29261);


var clients = {};
var matches = {};


function onConnect(socket) {
    socket.name = socket.remoteAddress + ":" + socket.remotePort;
    socket.on("data", (data) => {onData(data, socket.name)});
    socket.on("close", () => {removeClient(clients[socket.name])});
    socket.on("error", (err) => {});

    var client = {operation: 0x00, socket: socket, data: null}
    clients[socket.name] = client;
}


function onData(data, clientName) {
    var client = clients[clientName];

    if (client == undefined) {
        return;
    }

    if (client.operation == 0x00) {
        switch (data[0])
        {
            case 0x01:
                presentScoreboard(client);
                break;
        
            case 0x02:
                client.operation = 0x02;
                if (data.length > 1) {
                    data = data.subarray(1);
                }else{
                    return;
                }
                break;
            
            case 0x03:
                client.operation = 0x03;
                if (data.length > 1) {
                    data = data.subarray(1);
                }else{
                    return;
                }
                break;

            case 0x04:
                client.operation = 0x04;
                if (data.length > 1) {
                    data = data.subarray(1);
                }else{
                    return;
                }
                break;

            default:
                removeClient(client);
                break;
        }
    }

    if (client.data == null) {
        client.data = data;
    }else{
        client.data = Buffer.concat([client.data, data]);
    }


    if (client.operation == 0x02) {
        if (client.data.indexOf(0x00) != -1) {
            receiveScoreboardUpdate(client);
        }
    }

    if (client.operation == 0x03) {
        if (client.data.indexOf(0x01) != -1 && client.match == undefined) {
            
            var level = client.data.subarray(0, client.data.indexOf(0x01));client.data = client.data.subarray(client.data.indexOf(0x01)+1);
            var matchCode = crypto.randomBytes(3).toString("hex");

            while (matches[matchCode] != undefined) {
                matchCode = crypto.randomBytes(3).toString("hex");
            }
            
            matches[matchCode] = {"level": level, "host": client, "opponent": undefined};
            client.match = matchCode;
            client.socket.write(matchCode);
            console.log(client.socket.remoteAddress+" created match with code "+matchCode);

        }else if (client.data.indexOf(0x01) != -1 && client.match != undefined) {
            if (matches[client.match].opponent != undefined) {
                matches[client.match].opponent.socket.write(client.data.subarray(0, client.data.indexOf(0x01)+1));
                client.data = client.data.subarray(client.data.indexOf(0x01)+1);
            }
        }
    }

    if (client.operation == 0x04) {
        if (client.data.indexOf(0x01) != -1 && client.match == undefined) {
            
            var matchCode = client.data.subarray(0, client.data.indexOf(0x01)); client.data = client.data.subarray(client.data.indexOf(0x01)+1);

            if (matches[matchCode] == undefined) {
                var response = Buffer.from([0x04, 0x01]);
                client.socket.write(response);
                client.operation = 0xFF;
                console.log(client.socket.remoteAddress+" tried to join non existing match "+matchCode);  
            }else{
                client.match = matchCode.toString();
                matches[matchCode].opponent = client; 
                client.socket.write(Buffer.concat([matches[matchCode].level, Buffer.from([0x01])]));
                console.log(client.socket.remoteAddress+" joined match "+matchCode+" hosted by "+client.socket.remoteAddress); 
            }          

        }else if (client.data.indexOf(0x01) != -1 && client.match != undefined) {
            if (matches[client.match].host != undefined) {
                matches[client.match].host.socket.write(client.data.subarray(0, client.data.indexOf(0x01)+1)); client.data = client.data.subarray(client.data.indexOf(0x01)+1);
            }
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

                    while (indexOfNL != -1) {
                        var line = data.subarray(0, indexOfNL).toString("utf-8");
                        var entry = line.split(":");
                        data = data.subarray(indexOfNL+1);

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


function receiveScoreboardUpdate(client) {
    var levelCount = 0;
    while (true) {
        var fileName = highscoresDir + client.data.subarray(0, client.data.indexOf(0x01));
        client.data = client.data.subarray(client.data.indexOf(0x01) + 1);
        var payload = client.data.subarray(0, client.data.indexOf(0x01));
        client.data = client.data.subarray(client.data.indexOf(0x01) + 1);

        fs.writeFile(fileName, payload, {flag: "a"}, (err) => {if (err) { console.error(err); }});
        levelCount++;

        if (client.data[0] == 0x00) {
            console.log("Received updates for "+levelCount+" levels from "+client.socket.remoteAddress);
            client.socket.write("Received updates for "+levelCount+" levels.");
            removeClient(client);
            return;
        }
    }
}


function removeClient(client) {
    if (client == undefined) {
        return;
    }

    console.log("Removing client "+client.socket.remoteAddress);

    if (client.match != undefined) {
        removeMatch(client.match);
        return;
    }

    client.socket.end();
    client.socket.destroy();
    delete clients[client.socket.name];
}

function removeMatch(matchCode) {

    var match = matches[matchCode];
    
    if (match.host != undefined) {
        match.host.socket.write(Buffer.from([0x02, 0x01]));
        match.host.socket.end();
        console.log("Removed match "+matchCode+" host "+match.host.socket.remoteAddress);
        delete clients[match.host.socket.name];
    }
    if (match.opponent != undefined) {
        match.opponent.socket.write(Buffer.from([0x02, 0x01]));
        match.opponent.socket.end();
        console.log("Removed match "+matchCode+" opponent "+match.opponent.socket.remoteAddress);
        delete clients[match.opponent.socket.name];
    }

    delete matches[matchCode];
    console.log("Removed match "+matchCode);
}