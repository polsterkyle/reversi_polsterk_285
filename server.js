
/* Set up the static file server */
let static = require('node-static'); 

/* Set up HTTP server library */
let http = require('http');

/* Assume we are running on Heroku */
let port = process.env.PORT;
let directory = __dirname + '/public';

/* If not Heroku, then port and directory adjustment */
if((typeof port == 'undefined') || (port === null)){
    port = 8080;
        directory = './public';
}

/* Set up our static file web server to deliver files from system */
let file = new static.Server(directory);

let app = http.createServer(
    function(request, response){
        request.addListener('end',
        function(){
            file.serve(request,response);
            }
        ).resume();
    }
).listen(port);

console.log('The server is running');

/* Set up the web socket server */

/*Set up a registry of player information and socket IDs*/ 

let players = [];

const { Server } = require("socket.io");
const { constants } = require('buffer');
const io = new Server(app);

io.on('connection', (socket) => {

    /* Output a log message on the server */ 
    function serverLog(...messages){
        io.emit('log',['****Message from the server:\n']);
        messages.forEach((item) => {
            io.emit('log',['****\t'+item])
            console.log(item);
        })
    }

    serverLog('a page connected to the server: '+socket.id);

    /* join_room command handler */ 
    /* expected payload: {
        'room': the room to be joined, 
        'username': the name of the user joining the room
    }
    */ 
   /* join_room_response
    {
        'result': 'success',
        'room'L room that was joined,
        'username': the user that joined the room, 
        'count' the number of users in the chat room
        'socket_id': the socket of the user that just joined the room
    }

    or 

    {
        'result': 'fail',
        'message': the reason for failure
    }
    */

    socket.on('join_room', (payload) => {
        serverLog('Server received a command', '\'join_room\'',JSON.stringify(payload));
        /* Check client data */ 
        if ((typeof payload == 'undefined') || payload === null ){
            response = {};
            response.result= 'fail';
            response.message = 'client did not send a payload';
            socket.emit('join_room_response',response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
            }
        let room = payload.room;
        let username = payload.username;

        if ((typeof room == 'undefined') || room === null ){
            response = {};
            response.result= 'fail';
            response.message = 'client did not send a valid room to join';
            socket.emit('join_room_response',response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
            }

        if ((typeof username == 'undefined') || username === null ){
            response = {};
            response.result= 'fail';
            response.message = 'client did not send a valid username to join the chat room';
            socket.emit('join_room_response',response);
            serverLog('join_room command failed', JSON.stringify(response));
            return;
            }

        /* Handle the commeand */ 
        socket.join(room);

        /* Make sure the client was put in the room */ 
        io.in(room).fetchSockets().then((sockets)=>{
                /* Socket failed to join */
                if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.includes(socket)){
                    response = {};
                    response.result= 'fail';
                    response.message = 'Server internal error joining chat room';
                    socket.emit('join_room_response',response);
                    serverLog('join_room command failed', JSON.stringify(response));
                } 
                /* Socket did join room */
                else {

                    players[socket.id] = {
                        username: username,
                        room: room
                    }

                    /* Announce to e veryone that is in the room, who else is in the room */
                    for (const member of sockets){
                    let room = players[member.id].room;
                    response = {
                        result: 'success',
                        socket_id: member.id,
                        room: players[member.id].room,
                        username: players[member.id].username,
                        count: sockets.length,
                    }

                    /* Tell everyone a new user has joined the chatroom */ 
                    io.of('/').to(room).emit('join_room_response',response);
                    serverLog('join_room succeeded', JSON.stringify(response));
                    if(room !== "Lobby"){
                        send_game_update(socket,room,'initial update');
                    }
                }
            }
        });
    });



    socket.on('invite', (payload) => {
        serverLog('Server received a command', '\'invite\'',JSON.stringify(payload));
        /* Check client data */ 
        if ((typeof payload == 'undefined') || payload === null ){
            response = {};
            response.result= 'fail';
            response.message = 'client did not send a payload';
            socket.emit('invite_response',response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
        }
        let requested_user = payload.requested_user;
        let room = players[socket.id].room;
        let username = players[socket.id].username;

        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
            response = {
                result: 'fail',
                message:'client did not invite a valid user to invite to play'
        }
            socket.emit('invite_response',response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
            }

        if ((typeof room == 'undefined') || (room === null) || (room === "")){
                response = {
                    result: 'fail',
                    message:'the user that was invited is not in a room'
                }
                socket.emit('invite_response',response);
                serverLog('invite command failed', JSON.stringify(response));
                return;
            }

        if ((typeof username == 'undefined') || (username === null ) || (username === "")){
            response = {
                result: 'fail',
                message:'the user that was invited does not have a registered name'
            }
            socket.emit('invite_response',response);
            serverLog('invite command failed', JSON.stringify(response));
            return;
            }

        /* Handle the commeand */ 
        socket.join(room);

        /* Make sure that the invited player is present */
        io.in(room).allSockets().then((sockets) =>{
                /* Invitee isn't in the room */

                if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)){
                    response = {
                        result: 'fail',
                        message:'the user that was invited is not longer in the room'
                    }
                    socket.emit('invite_response',response);
                    serverLog('invite command failed', JSON.stringify(response));
                    return;
                } 
                /* Invitee did join room */
                else {
                    response = {
                        result: 'success',
                        socket_id: requested_user
                    }
                    socket.emit("invite_response", response);

                    response = {
                        result: 'success',
                        socket_id: socket.id
                    }
                    socket.to(requested_user).emit("invited", response);
                    serverLog('invite command succeeded', JSON.stringify(response));
                    
            }
        });

    });



    socket.on('uninvite', (payload) => {
        serverLog('Server received a command', '\'uninvite\'',JSON.stringify(payload));
        /* Check client data */ 
        if ((typeof payload == 'undefined') || payload === null ){
            response = {};
            response.result= 'fail';
            response.message = 'client did not send a payload';
            socket.emit('uninvited',response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
        }
        let requested_user = payload.requested_user;
        let room = players[socket.id].room;
        let username = players[socket.id].username;

        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
            response = {
                result: 'fail',
                message:'client did not invite a valid user to uninvite to play'
        }
            socket.emit('uninvited',response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
            }

        if ((typeof room == 'undefined') || (room === null) || (room === "")){
                response = {
                    result: 'fail',
                    message:'the user that was uninvited is not in a room'
                }
                socket.emit('uninvited',response);
                serverLog('uninvite command failed', JSON.stringify(response));
                return;
            }

        if ((typeof username == 'undefined') || (username === null ) || (username === "")){
            response = {
                result: 'fail',
                message:'the user that was uninvited does not have a registered name'
            }
            socket.emit('uninvited',response);
            serverLog('uninvite command failed', JSON.stringify(response));
            return;
            }

        /* Handle the commeand */ 
        socket.join(room);

        /* Make sure that the invited player is present */
        io.in(room).allSockets().then((sockets) =>{
                /* Uninvitee isn't in the room */

                if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)){
                    response = {
                        result: 'fail',
                        message:'the user that was uninvited is not longer in the room'
                    }
                    socket.emit('uninvited',response);
                    serverLog('uninvite command failed', JSON.stringify(response));
                    return;
                } 
                /* Uninvitee is in the room */
                else {
                    response = {
                        result: 'success',
                        socket_id: requested_user
                    }
                    socket.emit("uninvited", response);

                    response = {
                        result: 'success',
                        socket_id: socket.id
                    }
                    socket.to(requested_user).emit("uninvited", response);
                    serverLog('uninvite command succeeded', JSON.stringify(response));
                    
            }
        });

    });



    socket.on('game_start', (payload) => {
        serverLog('Server received a command', '\'game_start\'',JSON.stringify(payload));
        /* Check client data */ 
        if ((typeof payload == 'undefined') || payload === null ){
            response = {};
            response.result= 'fail';
            response.message = 'client did not send a payload';
            socket.emit('game_start_response',response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
        }
        let requested_user = payload.requested_user;
        let room = players[socket.id].room;
        let username = players[socket.id].username;

        if ((typeof requested_user == 'undefined') || (requested_user === null) || (requested_user === "")) {
            response = {
                result: 'fail',
                message:'client did not invite a valid user to uninvite to play'
        }
            socket.emit('game_start_response',response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
            }

        if ((typeof room == 'undefined') || (room === null) || (room === "")){
                response = {
                    result: 'fail',
                    message:'client did not request a valid user to engage in play'
                }
                socket.emit('game_start_response',response);
                serverLog('game_start command failed', JSON.stringify(response));
                return;
            }

        if ((typeof username == 'undefined') || (username === null ) || (username === "")){
            response = {
                result: 'fail',
                message:'the user that was engaged to play does not have a name registered'
            }
            socket.emit('game_start_response',response);
            serverLog('game_start command failed', JSON.stringify(response));
            return;
            }

        /* Handle the commeand */ 
        socket.join(room);

        /* Make sure that the player to engage is present */
        io.in(room).allSockets().then((sockets) =>{
                /* Engaged player isn't in the room */

                if ((typeof sockets == 'undefined') || (sockets === null) || !sockets.has(requested_user)){
                    response = {
                        result: 'fail',
                        message:'the user that was engaged to play is not longer in the room'
                    }
                    socket.emit('game_start_response',response);
                    serverLog('game_start command failed', JSON.stringify(response));
                    return;
                } 
                /* Engaged player is in the room */
                else {
                    let game_id = Math.floor(1 + Math.random() * 0x100000).toString(16);

                    response = {
                        result: 'success',
                        game_id: game_id,
                        socket_id: requested_user
                    }
                    socket.emit("game_start_response", response);
                    socket.to(requested_user).emit("game_start_response", response);
                    serverLog('game_start command succeeded', JSON.stringify(response));
                    
            }
        });

    });

    socket.on('disconnect', () => {
        serverLog('a page disconnected from the server: '+socket.id);
        if((typeof players[socket.id] != 'undefined') && (players[socket.id] != null)){
            let payload = {
                username: players[socket.id].username,
                room: players[socket.id].room,
                count: Object.keys(players).length - 1,
                socket_id: socket.id
            };

            let room = players[socket.id].room; 
            delete players[socket.id];
            /* Tell people who left the room */ 
            io.of("/").to(room).emit('player_disconnected', payload);
            serverLog('player_disconnected succeeded ', JSON.stringify(payload));
        }
    });


        /* send_chat_message command handler */ 
    /* expected payload: {
        'room': the room where the message will be sent, 
        'username': the name of the sender, 
        'message': the message to broadcast
    }
    */ 
   /* send_chat_message_response:
    {
        'result': 'success',
        'username': the user that sent the message, 
        'message' the message that was sent 
    }

    or 

    {
        'result': 'fail',
        'message': the reason for failure
    }
    */

    socket.on('send_chat_message', (payload) => {
        serverLog('Server received a command', '\'send_chat_message\'',JSON.stringify(payload));
        /* Check client data */ 
        if ((typeof payload == 'undefined') || payload === null ){
            response = {};
            response.result= 'fail';
            response.message = 'client did not send a payload';
            socket.emit('send_chat_message_response',response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
            }
        let room = payload.room;
        let username = payload.username;
        let message = payload.message;
        if ((typeof room == 'undefined') || room === null ){
            response = {};
            response.result= 'fail';
            response.message = 'client did not send a valid message';
            socket.emit('send_chat_message_response',response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
            }

        if ((typeof username == 'undefined') || username === null ){
            response = {};
            response.result= 'fail';
            response.message = 'client did not send a valid username as a message';
            socket.emit('send_chat_message_response',response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
            }

        if ((typeof message == 'undefined') || message === null ){
            response = {};
            response.result= 'fail';
            response.message = 'client did not send a valid message';
            socket.emit('send_chat_message_response',response);
            serverLog('send_chat_message command failed', JSON.stringify(response));
            return;
            }

        /* Handler */
        let response = {};
        response.result = 'success';
        response.username = username;
        response.room = room;
        response.message = message;
        /* Tell everyone in the room what the message is */ 
        io.of('/').to(room).emit('send_chat_message_response', response);
        serverLog('send_chat_message command succeeded', JSON.stringify(response));
    });
});

/********************************* */
/* Code related to game state */

let games = [];

function create_new_game() {
    let new_game = {};
    new_game.player_light = {};
    new_game.player_light.socket = "";
    new_game.player_light.username = "";

    new_game.player_dark = {};
    new_game.player_dark.socket = "";
    new_game.player_dark.username = "";

    var d = new Date();
    new_game.last_move_time = d.getTime();

    new_game.whose_turn = 'light';

    new_game.board = [
        [ ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [ ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [ ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [ ' ', ' ', ' ', 'l', 'd', ' ', ' ', ' '],
        [ ' ', ' ', ' ', 'd', 'l', ' ', ' ', ' '],
        [ ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [ ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
        [ ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ']
    ];

    return new_game;

}

function send_game_update(socket,game_id,message){
    /* Check to see if a game with game_id exists */
    /* Make sure only 2 people are in the room */ 
    /* Assign the socket a color */ 
    /* Send the update */ 
    /* Check if the game is over */ 

    /* Check to see if a game with game_id exists */
    if ((typeof games[game_id] == 'undefined') || (games[game_id] === null)) {
        console.log("No game exists with game_id:" + game_id + " Making a new game." + socket.id);
        games[game_id] = create_new_game();
    }

    /* Send the update */ 
    let payload = {
        result: 'success',
        game_id: game_id,
        game: games[game_id],
        message: message
    }
    io.of("/").to(game_id).emit('game_update',payload);
}

