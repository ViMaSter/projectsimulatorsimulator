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

const ws = require('websocket');
const http = require('http');

const server = http.createServer(function(request, response) {});
server.listen(process.env.PORT, function() { });

const wsServer = new ws.server({
	httpServer: server
});

class Session {
	constructor(ID)
	{
		this.ID = ID;
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
		gameServer.sendMessageToPlayer(playerID, JSON.stringify({"command": "sessionJoin", "sessionID": this.ID, "session": session.serialize()}));
		this.replicateChanges();
	}

	removePlayerByID(playerID)
	{
		this.connectedPlayerIDs.remove(playerID);
		gameServer.sendMessageToPlayer(playerID, "{}")
	}

	updateCarPosition(x, y)
	{
		this.sessionData.carPosition.x = x; 
		this.sessionData.carPosition.y = y; 

		console.log(`Car now at [${x}, ${y}]`);
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
	constructor()
	{
		this.nextSessionID = 0;
		this.sessions = {};

		this.nextPlayerID = 0;
		this.player = {};

		this.gameLogic = {
			"createSession": function(playerID, jsonMessage)
			{
				const newSessionID = this.generateSessionID();
				this.sessions[newSessionID] = new Session(newSessionID);
				this.sessions[newSessionID].addPlayerByID(playerID);
				console.log(`Created new session with ID ${newSessionID}`);
				return {"sessionID": newSessionID};
			},
			"joinSession": function(playerID, jsonMessage)
			{
				console.log(`Player ${playerID} attempting to join session ${jsonMessage.sessionID}`);
				if (jsonMessage.sessionID < 0)
				{
					console.log("Invalid session id");
					return {"sessionID": -1};
				}

				if (!this.sessions[jsonMessage.sessionID])
				{
					console.log("Session doesn't exist");
					return {"sessionID": -1};
				}

				this.sessions[jsonMessage.sessionID].addPlayerByID(playerID);
				console.log(`Added player ${playerID} to session ${jsonMessage.sessionID}`);
				return {"sessionID": jsonMessage.sessionID};
			},
			"updateCarPosition": function(playerID, jsonMessage)
			{
				if (typeof jsonMessage.sessionID != "number")
				{
					console.error("updateCarPosition requires a 'sessionID'-parameter as number!");
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
					console.error("setCurrentRoute requires a 'sessionID'-parameter as number!");
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
					console.error("finishRoute requires a 'sessionID'-parameter as number!");
					return;
				}
				this.sessions[jsonMessage.sessionID].finishRoute();
			},
			"leaveSession": function(playerID, jsonMessage)
			{
				if (typeof jsonMessage.sessionID != "number")
				{
					console.error("leaveSession requires a 'sessionID'-parameter as number!");
					return;
				}
				this.sessions[jsonMessage.sessionID].removePlayerByID(playerID);
			}
		};
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
				this.gameLogic[jsonMessage.command].apply(this, [playerID, jsonMessage]);
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
		this.player[playerID] = connection;
		console.log(`Added player ${playerID}`);

		this.player[playerID].on('message', function(message) {
			if (message.type === 'utf8')
			{
				try
				{
					const jsonMessage = JSON.parse(message.utf8Data);
					gameServer.handleMessage(playerID, jsonMessage);
					console.log("Successfully handled message!");
					console.log(message.utf8Data);
				}
				catch(e)
				{
					console.group();
					console.error("Invalid JSON string received!");
					console.error(message);
					console.error(e);
					console.groupEnd();
				}
			}
		});

		this.player[playerID].on('close', function(connection) {
			delete this.player[playerID];
		}.bind(this));
	}

	sendMessageToPlayer(playerID, message)
	{
		if (!this.player[playerID])
		{
			console.error(`No player with ID ${playerID} is connected!`);
			return false;
		}

		this.player[playerID].send(message);
		console.log(`Sending message to player ${playerID}: ${message}`);
		return true;
	}

	updateReplica(session)
	{
		session.connectedPlayerIDs.forEach(function(playerID)
		{
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