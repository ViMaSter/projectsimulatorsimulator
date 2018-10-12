const ws = require('websocket');
const http = require('http');

const server = http.createServer(function(request, response) {});
server.listen(process.env.PORT, function() { });

const wsServer = new ws.server({
	httpServer: server
});

class Session {
	constructor()
	{
		this.sessionData = {
			"carPosition": {
				"x": 5,
				"y": 6
			}
		};
		this.connectedPlayerIDs = [];
	}

	addPlayerByID(playerID)
	{
		this.connectedPlayerIDs.push(playerID);
		this.replicateChanges();
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
		this.connectedPlayerIDs.forEach(function(playerID)
		{
			gameServer.updateReplica(this);
		}.bind(this));
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
				this.sessions[newSessionID] = new Session();
				this.sessions[newSessionID].addPlayerByID(playerID);
				console.log(`Created new session with ID ${newSessionID}`);
				return {"sessionID": newSessionID};
			},
			"updateCarPosition": function(playerID, jsonMessage)
			{
				if (jsonMessage.sessionID && typeof jsonMessage.sessionID != "number")
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
		// handle player assoication
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
		else
		{

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
		if (typeof this.player[playerID] == "undefined")
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
		console.log(session);
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