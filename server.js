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
		this.playerConnections = [];
	}

	addPlayer(player)
	{
		this.playerConnections.push(player);
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
		this.playerConnections.forEach(function(player)
		{
			// TODO: NOTIFY ALL LISTENERS OF NEW POSITION (REPLICATION?)
		});
	}
};

class GameServer
{
	constructor()
	{
		this.sessions = {};
		this.nextSessionID = 0;
		this.gameLogic = {
			"createSession": function(jsonMessage)
			{
				const newSessionID = this.generateSessionID();
				this.sessions[newSessionID] = new Session();
				console.log(`Created new session with ID ${newSessionID}`);
			},
			"updateCarPosition": function(jsonMessage)
			{
				if (jsonMessage.sessionID && typeof jsonMessage.sessionID == "function")
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

	generateSessionID()
	{
		return this.nextSessionID++;
	}

	handleMessage(connection, jsonMessage)
	{
		// handle player assoication
		if (jsonMessage.command)
		{
			if (typeof this.gameLogic[jsonMessage.command] == "function")
			{
				this.gameLogic[jsonMessage.command].apply(this, [jsonMessage]);
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
};

const gameServer = new GameServer();

wsServer.on('request', function(request) {
	var connection = request.accept(null, request.origin);

	connection.on('message', function(message) {
		if (message.type === 'utf8')
		{
			try
			{
				const jsonMessage = JSON.parse(message.utf8Data);
				gameServer.handleMessage(connection, jsonMessage);
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

	connection.on('close', function(connection) {

	});
});
console.log(`Running at port ${process.env.PORT}`);