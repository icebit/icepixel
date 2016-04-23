var express = require("express");
var fs = require("fs");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);
var bodyParser = require("body-parser");
var engine = require("./engine");
var UUID = require("node-uuid");

var playerAccel = 0.3;

var rooms = [];
var authentications = [];

//Load config
var configFile = fs.readFileSync("config.json");
var config = JSON.parse(configFile);

//Routing

app.use("/", express.static("view"));
app.use("/admin", express.static("admin"));
app.use(bodyParser.urlencoded({
  extended: false
}));

//Add a room
var room0 = new engine.Room();
rooms.push(room0);
if (cubicMap = JSON.parse(fs.readFileSync("maps/cubic.json"))) {}
room0.loadMap(cubicMap);

//Run server
http.listen(config.port, function() {
  console.log("icepixel now running on port " + config.port);
});

var clients = {};

//Handle connection
io.on("connection", function(socket) {
  var id = UUID();
  var username;
  var connected;
  socket.emit("numRooms", rooms.length);
  socket.on("numRoomsRequest", function() {
    console.log("adminRoomsRequest");
    socket.emit("numRooms", rooms.length);
  });
  socket.on("adminLogin", function(password) {
    if (password == config.adminPassword) {
      console.log("Admin logged in");
      socket.emit("adminSuccess", 0);
      socket.on("kick", function(id, room) {
        rooms[room].removePlayerById(id);
      });
      socket.on("adminGetPlayersInRoom", function(room) {
        socket.emit("adminReturnPlayersInRoom", rooms[room].data.players);
      });
    } else {
      console.log("Admin login attempt failed, password " + password);
      socket.emit("adminFailed", 0);
    }
  });
  socket.on("joinRoom", function(room) {
    if (rooms[room]) {
      socket.emit("joinRoomResponse", 0);
    } else {
      socket.emit("joinRoomResponse", 1);
    }
    socket.on("username", function(name) {
      if (connected) {
        return;
      }
      if (name == "" || name == null) {
        console.log("No username");
        socket.emit("play", 1);
        return;
      }
      username = name;
      connected = true;
      socket.emit("play", 0);
      console.log("Connection: room: " + room + " id: " + id + " username: " + username);
      //Ingame
      var playerIndex = rooms[room].addPlayer(id, username);
      var curPlayer = rooms[room].getPlayerByIndex(playerIndex);
      curPlayer.maxVel = config.players.maxVel;
      curPlayer.pos = new engine.Vec2(Math.random() * 2000 - 500, Math.random() * 1500 - 500);
			curPlayer.vel = new engine.Vec2(Math.random() * 10 - 5, Math.random() * 10 - 5);

			//Save socket for further use
			clients[id] = socket;

      socket.on("inputUpdate", function(input) {
        curPlayer.input = input;
      });

      socket.on("requestIndex", function() {
        socket.emit("index", playerIndex);
      });

      socket.emit("map", rooms[room].map);

      socket.on("fire", function(pos) {
        if (curPlayer.fireTimer > 20) {
          //Calculate direction
          var dis = new engine.Vec2(pos.x - curPlayer.pos.x, pos.y - curPlayer.pos.y);
          var mag = Math.sqrt(dis.x * dis.x + dis.y * dis.y);
					var vel = Math.sqrt(curPlayer.vel.x * curPlayer.vel.x + curPlayer.vel.y * curPlayer.vel.y);
          var dir = new engine.Vec2(dis.x / mag * (vel * 0.07 + 0.32), dis.y / mag * (vel * 0.07 + 0.32));
          rooms[room].spawnProjectile(new engine.Vec2(curPlayer.pos.x, curPlayer.pos.y), dir, id);
          curPlayer.fireTimer = 0;
        }
      });

      //Disconnections
      socket.on("disconnect", function() {
        rooms[room].removePlayerById(id);
        console.log("Disconnection: room: " + room + " id: " + id + " username: " + username);
      });
    });
  });
});

setInterval(updateRooms, 15);
setInterval(sendUpdate, config.updateDelta);

function updateRooms() {
  for (a = 0; a < rooms.length; a++) {
    for (i = 0; i < rooms[a].data.projectiles.length; i++) {
      var curProj = rooms[a].data.projectiles[i];
      if (curProj.dead == true) {
        rooms[a].removeProjectileByIndex(i);
        return;
      }
      curProj.update();

      for (p = 0; p < rooms[a].data.players.length; p++) {

        if (curProj.pos.x > rooms[a].data.players[p].pos.x - (rooms[a].data.players[p].width)
					&& curProj.pos.x < rooms[a].data.players[p].pos.x + (rooms[a].data.players[p].width)
					&& curProj.pos.y > rooms[a].data.players[p].pos.y - (rooms[a].data.players[p].height)
					&& curProj.pos.y < rooms[a].data.players[p].pos.y + (rooms[a].data.players[p].height)) {

					if (rooms[a].data.players[p].id != curProj.id) {
            rooms[a].getPlayerById(curProj.id).score++;
						clients[curProj.id].emit("kill", rooms[a].data.players[p].username);
						clients[rooms[a].data.players[p].id].emit("killed", rooms[a].getPlayerById(curProj.id).username);
            console.log(curProj.id);
            rooms[a].data.players[p].dead = true;
            curProj.dead = true;
          }
        }
      }
    }

    for (i = 0; i < rooms[a].data.players.length; i++) {
      var curPlayer = rooms[a].data.players[i];
      if (curPlayer.input) {
        var moveX = 0;
        var moveY = 0;
        if (curPlayer.input.left) moveX -= 1;
        if (curPlayer.input.right) moveX += 1;
        if (curPlayer.input.up) moveY -= 1;
        if (curPlayer.input.down) moveY += 1;

        curPlayer.vel.x += moveX * playerAccel;
        curPlayer.vel.y += moveY * playerAccel;

        if (moveX == 0) {
          curPlayer.vel.x *= 0.98;
        }
        if (moveY == 0) {
          curPlayer.vel.y *= 0.98;
        }

      }

      /*for (var i = 0; i < rooms[a].map.walls.length; i++) {
        if (rooms[a].map.walls.hasOwnProperty(i)) {
          var wall = rooms[a].map.walls[i];
          if (curPlayer.x - (curPlayer.width / 2) < wall.x + (wall.width) && curPlayer.x + (curPlayer.width / 2) > wall.x &&
            curPlayer.y - (curPlayer.height / 2) < wall.y + (wall.height) && curPlayer.y + (curPlayer.height / 2) > wall.y
          ) {
						console.log("Touch");
					}
        }
      }*/

      if (curPlayer.pos.x < -500 + 20) {
        curPlayer.vel.x += 3;
      }
      if (curPlayer.pos.x > 1500 - 20) {
        curPlayer.vel.x -= 3;
      }

      if (curPlayer.pos.y < -500 + 20) {
        curPlayer.vel.y += 3;
      }

      if (curPlayer.pos.y > 1000 - 20) {
        curPlayer.vel.y -= 3;
      }

      if (curPlayer.dead) {
        curPlayer.dead = false;
        curPlayer.spawn(new engine.Vec2(Math.random() * 2000 - 500, Math.random() * 1500 - 500), new engine.Vec2(Math.random() * 10 - 5, Math.random() * 10 - 5));
        console.log("Player " + curPlayer.username + " died");
      }

      curPlayer.update();
    }

  }
}

function sendUpdate() {
  io.emit("roomUpdate", rooms[0].data);
}
