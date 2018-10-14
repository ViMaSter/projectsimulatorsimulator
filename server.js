Array.prototype.remove = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

const fs = require("fs");
const ws = require('websocket');
const http = require('http');

const server = http.createServer(function(request, response) {});
server.listen(process.env.PORT, function() { });

const wsServer = new ws.server({
	httpServer: server
});

class Session {
	constructor(ID, mapName)
	{
		this.ID = ID;
		this.mapName = mapName;
		this.validStations = [];
		gameServer.maps[mapName].routes.forEach(function(landmark)
		{
			this.validStations.push(landmark.name);
		}.bind(this));
		this.sessionData = {
			"carPosition": {
				"x": 5,
				"y": 6
			},
			"currentRoute": {
				"start": "",
				"end": ""
			}
		};
		this.connectedPlayerIDs = [];
	}

	addPlayerByID(playerID)
	{
		this.connectedPlayerIDs.push(playerID);
		gameServer.sendMessageToPlayer(playerID, JSON.stringify({"command": "sessionJoin", "sessionID": this.ID, "mapName": this.mapName, "session": this.serialize()}));
	}

	removePlayerByID(playerID)
	{
		if (this.connectedPlayerIDs.indexOf(playerID) <= -1)
		{
			console.error(`Player ${playerID} is not part of session ${this.ID} (current player: ${this.connectedPlayerIDs.join(', ')})`);
			return;
		}
		this.connectedPlayerIDs.remove(playerID);
		gameServer.sendMessageToPlayer(playerID, "{}");
	}

	updateCarPosition(x, y)
	{
		this.sessionData.carPosition.x = x; 
		this.sessionData.carPosition.y = y; 

		this.replicateChanges();
	}

	replicateChanges()
	{
		gameServer.updateReplica(this);
	}

	setCurrentRoute(start, end)
	{
		if (this.sessionData.currentRoute.start == "" && this.sessionData.currentRoute.end == "")
		{
			if (this.validStations.indexOf(start) <= -1)
			{
				console.warn(`Start point ${start} does not exist on the map ${this.mapName}!`);
			}
			if (this.validStations.indexOf(end) <= -1)
			{
				console.warn(`Start point ${end} does not exist on the map ${this.mapName}!`);
			}

			this.sessionData.currentRoute.start = start;
			this.sessionData.currentRoute.end = end;
		}

		gameServer.updateReplica(this);
	}

	finishRoute()
	{
		this.sessionData.currentRoute.start = "";
		this.sessionData.currentRoute.end = "";

		gameServer.updateReplica(this);
	}

	serialize()
	{
		return this.sessionData;
	}
};

class GameServer
{
	LoadMaps()
	{
		this.maps = {};

		const files = fs.readdirSync("maps");
		files.forEach(file => {
			console.log(`Attempting to load filer '${file}'...`)
			const fileContent = fs.readFileSync("maps/"+file);
			this.maps[file.replace(".json", "")] = JSON.parse(fileContent);
			console.log(`Loading '${file}'...DONE!`)
		});
		console.group(`Available maps:`)
		console.log(this.maps);
		console.groupEnd()
	}

	SetupGameLogic()
	{
		this.gameLogic = {
			"createSession": function(playerID, jsonMessage)
			{
				if (!jsonMessage.mapName || !this.maps[jsonMessage.mapName])
				{
					console.log(`Cannot create session; '${jsonMessage.mapName}' is not a valid map name!`);
				}

				const newSessionID = this.generateSessionID();
				this.sessions[newSessionID] = new Session(newSessionID, jsonMessage.mapName);
				this.sessions[newSessionID].addPlayerByID(playerID);
				console.log(`Created new session with ID ${newSessionID}`);
				return {"sessionID": newSessionID};
			},
			"joinSession": function(playerID, jsonMessage)
			{
				console.log(`Player ${playerID} attempting to join session ${jsonMessage.sessionID}`);
				if (jsonMessage.sessionID < -1)
				{
					console.log("Invalid session id");
					return {"sessionID": -1};
				}

				if (jsonMessage.sessionID == -1)
				{
					jsonMessage.sessionID = this.nextSessionID - 1;
				}

				if (!this.sessions[jsonMessage.sessionID])
				{
					console.log(`Session ${jsonMessage.sessionID} (no longer) doesn't exist`);
					return {"sessionID": -1};
				}

				this.sessions[jsonMessage.sessionID].addPlayerByID(playerID);
				return {"sessionID": jsonMessage.sessionID};
			},
			"updateCarPosition": function(playerID, jsonMessage)
			{
				if (typeof jsonMessage.sessionID != "number")
				{
					console.error(`updateCarPosition requires a 'sessionID'-parameter as number! (supplied: ${jsonMessage.sessionID} [${typeof jsonMessage.sessionID}])`);
					return;
				}
				
				if (!this.sessions[jsonMessage.sessionID])
				{
					console.error(`Session with ID ${jsonMessage.sessionID} does not exist!`);
					return;
				}

				this.sessions[jsonMessage.sessionID].updateCarPosition(jsonMessage.x, jsonMessage.y);
			},
			"setCurrentRoute": function(playerID, jsonMessage)
			{
				if (typeof jsonMessage.sessionID != "number")
				{
					console.error(`setCurrentRoute requires a 'sessionID'-parameter as number! (supplied: ${jsonMessage.sessionID} [${typeof jsonMessage.sessionID}])`);
					return;
				}
				if (typeof jsonMessage.start != "string" && typeof jsonMessage.end != "string")
				{
					console.error("updateCarPosition requires a 'start'- and 'end'-parameter as string!");
					return;
				}
				
				this.sessions[jsonMessage.sessionID].setCurrentRoute(jsonMessage.start, jsonMessage.end);
			},
			"finishRoute": function(playerID, jsonMessage)
			{
				if (typeof jsonMessage.sessionID != "number")
				{
					console.error(`finishRoute requires a 'sessionID'-parameter as number! (supplied: ${jsonMessage.sessionID} [${typeof jsonMessage.sessionID}])`);
					return;
				}
				this.sessions[jsonMessage.sessionID].finishRoute();
			},
			"leaveSession": function(playerID, jsonMessage)
			{
				if (typeof jsonMessage.sessionID != "number")
				{
					console.error(`leaveSession requires a 'sessionID'-parameter as number! (supplied: ${jsonMessage.sessionID} [${typeof jsonMessage.sessionID}])`);
					return;
				}
				this.sessions[jsonMessage.sessionID].removePlayerByID(playerID);
				console.log(`Players left in session ${jsonMessage.sessionID}: ${this.sessions[jsonMessage.sessionID].connectedPlayerIDs.length}`);
				if (!this.sessions[jsonMessage.sessionID].connectedPlayerIDs.length)
				{
					console.log(`Session ${jsonMessage.sessionID} has no players left; discarding it`);
					delete this.sessions[jsonMessage.sessionID];
				}
			}
		};
	}

	constructor()
	{
		this.nextSessionID = 0;
		this.sessions = {};

		this.nextPlayerID = 0;
		this.player = {};

		this.LoadMaps();

		this.SetupGameLogic();
	}

	generatePlayerID()
	{
		return this.nextPlayerID++;
	}

	generateSessionID()
	{
		return this.nextSessionID++;
	}

	handleMessage(playerID, jsonMessage)
	{
		if (jsonMessage.command)
		{
			if (typeof this.gameLogic[jsonMessage.command] == "function")
			{
				this.gameLogic[jsonMessage.command].apply(this, [parseInt(playerID), jsonMessage]);
			}
			else
			{
				console.error(`no gamelogic called "${jsonMessage.command}" available`)
			}
		}
	}

	addPlayer(connection)
	{
		const playerID = this.generatePlayerID();
		connection.playerID = playerID;
		this.player[playerID] = connection;
		console.log(`Added player ${playerID}`);

		this.player[playerID].on('message', function(message) {
			if (message.type === 'utf8')
			{
				try
				{
					const jsonMessage = JSON.parse(message.utf8Data);
					gameServer.handleMessage(playerID, jsonMessage);
				}
				catch(e)
				{
					console.group("Invalid JSON string received!");
					console.error(message);
					console.error(e);
					console.groupEnd();
				}
			}
		});

		this.player[playerID].on('close', function(reasonCode, description) {
			this.removePlayer(connection);
		}.bind(this));
	}

	removePlayer(connection)
	{
		const playerIDOfConnection = parseInt(connection.playerID);
		console.log(`Connection from player ${playerIDOfConnection} closed...`);
		for (const sessionID in this.sessions)
		{
			const playerIndex = this.sessions[sessionID].connectedPlayerIDs.indexOf(playerIDOfConnection);
			if (playerIndex != -1)
			{
				console.log(`Gracefully removing player ${playerIDOfConnection} from session ${sessionID}...`);
				this.gameLogic.leaveSession.apply(this, [playerIDOfConnection, {"sessionID": parseInt(sessionID)}]);
			}
		}
		delete this.player[playerIDOfConnection];
	}

	sendMessageToPlayer(playerID, message)
	{
		playerID = parseInt(playerID);
		if (!this.player[playerID])
		{
			console.error(`No player with ID ${playerID} is connected!`);
			return false;
		}

		this.player[playerID].send(message);
		return true;
	}

	updateReplica(session)
	{
		session.connectedPlayerIDs.forEach(function(playerID)
		{
			playerID = parseInt(playerID);
			this.sendMessageToPlayer(playerID, JSON.stringify({"command": "sessionUpdate", "session": session.serialize()}));
		}.bind(this));
	}
};

const gameServer = new GameServer();

wsServer.on('request', function(request) {
	var connection = request.accept(null, request.origin);

	gameServer.addPlayer(connection);
});
console.log(`Running at port ${process.env.PORT}`);