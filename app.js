const WebSocketServer = require('websocket').server;
const UIDGenerator = require('uid-generator');
const cookieParser = require('cookie-parser');
const WebSocket = require('ws');
const express = require('express');
const uidgen = new UIDGenerator(256);
const Enmap = require('enmap');
const http = require('http');
const app = express();
const fs = require('fs');
const _ = require('underscore');

const tokens = new Enmap({ name: "tokens", autoFetch: true, fetchAll: false });
const users = new Enmap({ name: "users", autoFetch: true, fetchAll: false });
const used = new Enmap({ name: "used", autoFetch: true, fetchAll: false });
const ids = new Enmap({ name: "ids", autoFetch: true, fetchAll: false });

const gameSettingPresets = {
    uno: {
        theme: "default",
        cards: 7,
        unoPenalty: 4,
        stacking: true,
        challenge: true,
        sevenO: false,
        jumpIn: false,
        handsDown: false
    }
}

let lobbies = {
    "test": {
        leader: {
            id: 1,
            username: "noes"
        },
        size: 4,
        gameID: "uno",
        gameSettings: {...gameSettingPresets["uno"]}
    }
}

if (!used.get("usernames")) used.set("usernames", []);
if (!used.get("tokens")) used.set("tokens", []);
if (!used.get("emails")) used.set("emails", []);

function auth(req, res, next) {
    if (req.cookies["token"]) {
        if (tokens.get(req.cookies["token"])) {
            if (tokens.get(req.cookies["token"], "id") == req.cookies["uid"]) {
                if (users.get(tokens.get(req.cookies["token"]).username, "admin")) {
                    console.log('success!')
                    next();
                } else res.status(401).send('Requires administrator permissions');
            } else res.status(400).send('Invalid session');
        } else res.status(400).send('Invalid session');
    } else res.status(401).send('Not permitted');
}

app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.json());

app.use(function (req, res, next) {
    const uid = parseInt(req.cookies["uid"]);
    const token = req.cookies["token"];
    if (!req.cookies["uid"]) res.clearCookie('token');
    if (!req.cookies["token"]) res.clearCookie('uid');
    if (!req.cookies["uid"] && !req.cookies["token"]) return next();
    if (tokens.get(req.cookies["token"])) {
        const tuid = parseInt(tokens.get(req.cookies["token"], "id"));
        if (uid === tuid) {
            res.cookie('token', req.cookies["token"], { maxAge: 14 * 24 * 3600000 });
            res.cookie('uid', req.cookies["uid"], { maxAge: 14 * 24 * 3600000 });
        } else {
            res.clearCookie('token');
            res.clearCookie('uid');
        }
    } else {
        res.clearCookie('token');
        res.clearCookie('uid');
    }
    next();
});

app.get('/', function (req, res) { res.sendFile(__dirname + '/home.html'); });
app.get('/header', function (req, res) { res.sendFile(__dirname + '/header.html'); });
app.get('/reset', function (req, res) {
    used.set("usernames", []);
    used.set("tokens", []);
    used.set("emails", []);
    tokens.clear();
    users.clear();
    res.redirect("/login");
});
app.get('/bylukykillboosting', function (req, res) { res.sendFile(__dirname + '/other/by_luky killboosting.html'); });
app.route('/lobbies')
    .get((req, res) => {
        let page = parseInt(req.query.page)-1, pageSize = parseInt(req.query.pageSize);
        if (req.query.pageSize && req.query.page) res.json(_.chunk(lobbies, pageSize)[page]);
        else {
            if (pageSize) res.json(_.chunk(lobbies, pageSize));
            else res.json(lobbies);
        }
    })
    .post((req, res) => {

    })
app.get('/login', function (req, res) {
    if (req.cookies["token"]) {
        if (tokens.get(req.cookies["token"])) {
            if (tokens.get(req.cookies["token"], "id") == req.cookies["uid"]) {
                return res.redirect("/");
            }
        }
    }
    res.sendFile(__dirname + '/login.html');
});
app.get('/register', function (req, res) {
    if (req.cookies["token"]) {
        if (tokens.get(req.cookies["token"])) {
            if (tokens.get(req.cookies["token"], "id") == req.cookies["uid"]) {
                return res.redirect("/");
            }
        }
    }
    res.sendFile(__dirname + '/register.html');
});
app.get('/logout', function (req, res) {
    res.clearCookie('token');
    res.clearCookie('uid');
    res.redirect(req.headers.referer || "/");
});
app.get('/profile/:id', function (req, res) {
    if (fs.existsSync(__dirname + `profiles/${req.params.id}.html`)) res.sendFile(__dirname + `/profiles/${req.params.id}.html`);
    else res.redirect('/' + req.params.id);
});
app.get('/profile', function (req, res) {
    if (!req.cookies["uid"]) res.redirect("/login");
    else res.redirect(`/profile/${req.cookies["uid"]}`)
    //else res.sendFile(__dirname + '/profile.html');
});

app.get('/announcement', function (req, res) {
    res.send(String(fs.readFileSync(__dirname + "/announcement.txt")));
});

app.post('/announcement', function (req, res) {
    fs.writeFileSync(__dirname + '/announcement.txt', req.body["announcement"], function (err) { if (err) return console.log(err); });
})

app.get('/users/:id/:data', function (req, res) {
    const id = req.params.id
    const data = req.params.data
    if (!id || !data) return res.sendStatus(400);
    //if (!users.find('id', parseInt(id))) return res.status(400).send('user doesn\'t exist');
    if (!ids.get(id)) return res.status(400).send('user doesn\'t exist');

    var rUsername = ids.get(id, "username");
    if (data.toLowerCase() == "username") {
        if (rUsername) return res.send(rUsername);
        else return res.sendStatus(401).send('no username');
    } else if (data.toLowerCase() == "avatar") {
        if (fs.existsSync(__dirname + "/avatars/" + id + ".png")) return res.sendFile(__dirname + "/avatars/" + id + ".png");
        else return res.sendFile(__dirname + "/avatars/default.png");
    } else if (data.toLowerCase() == "friends") {
        if (users.get(rUsername, "friends")) return res.json(users.get(rUsername, "friends"));
        else {
            users.set(rUsername, [], "friends")
            return res.json(users.get(rUsername, "friends"));
        }
    } else if (data.toLowerCase() == "status") {
        if (users.get(rUsername, "status")) return res.json(users.get(rUsername, "status"));
        else {
            users.set(rUsername, {
                status: "online",
                activity: null,
                message: ""
            }, "status")
            return res.json(users.get(rUsername, "status"));
        }
    } else return res.sendStatus(401).send('balls');
});

app.get('/users', auth, function (req, res) {
    res.json(JSON.parse(users.export()));
});

app.get('/ids', auth, function (req, res) {
    res.json(JSON.parse(ids.export()));
});

app.post("/login/login", function (req, res) {
    const username = req.body["user"];
    const password = req.body["pass"];
    if (!users.get(username)) return res.redirect("/login?username");
    if (users.get(username, "password") != password) return res.redirect("/login?password");
    var uid = users.get(username, "id")
    var token = users.get(username, "token")

    users.push(username, {
        date: parseInt(Date.now()),
        IP: req.socket.remoteAddress
    }, "logins");
    res.cookie('token', token, { maxAge: 14 * 24 * 3600000 });
    res.cookie('uid', uid, { maxAge: 14 * 24 * 3600000 });
    console.log("cookies set\n\n");
    res.redirect("/profile/" + uid);
});

app.post("/register/register", function (req, res, next) {
    const username = req.body["user"];
    const email = req.body["email"];
    const password = req.body["pass"];
    const conf = req.body["conf"];
    if (!username || !email || !password || !conf) return res.redirect("/register?missing");
    if (used.get("usernames").includes(username)) return res.redirect("/register?username");
    if (used.get("emails").includes(email)) return res.redirect("/register?email");
    if (password !== conf) return res.redirect("/register?password");
    used.push("usernames", username);
    used.push("emails", email);
    const token = uidgen.generateSync();
    const userid = users.array().length + 1;
    console.log('saved uid as ' + typeof userid + " " + userid)
    var admin = false;
    if (username == "noes") admin = true;
    used.push("tokens", token);

    tokens.set(token, {
        username,
        id: userid,
        expiry: parseInt(Date.now()) + (14/*days*/ * 24 * 3600000)
    })

    ids.set(String(userid), {
        username
    });
    users.set(username, {
        username,
        cosmetics: {},
        id: userid,
        status: {
            status: "online",
            activity: null,
            message: ""
        },
        email,
        password,
        token,
        joinDate: parseInt(Date.now()),
        settings: {},
        logins: [{
            date: parseInt(Date.now()),
            IP: req.socket.remoteAddress
        }],
        friends: [],
        frequests: [],
        messages: {},
        bals: {},
        admin
    })

    if (!req.cookies["token"]) {
        res.cookie('token', token, { maxAge: 14 * 24 * 3600000 });
    }
    if (!req.cookies["uid"]) {
        res.cookie('uid', userid, { maxAge: 14 * 24 * 3600000 });
    }
    res.redirect("/profile");
});

app.all('*', function (req, res) {
    res.redirect("/");
});

app.listen(80, () => console.log(`app listening on port 80!`));















var server = http.createServer(function (request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});

wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});

function originIsAllowed(origin) {
    return true;
}

wsServer.on('request', function (req) {
    if (!originIsAllowed(req.origin)) {
        req.reject();
        console.log((new Date()) + ' Connection from origin ' + req.origin + ' rejected.');
        return;
    }

    var connection = req.accept('echo-protocol', req.origin);
    var username, token, uid;

    connection.on('message', function (message) {
        data = JSON.parse(message.utf8Data);
        token = data["token"];
        uid = data["uid"];
        if (token && uid) {
            username = ids.get(uid, "username");
            users.set(username, "online", "status.status");
            console.log(username + " is now online");
        } else console.log('no token/uid')
    });

    connection.on('close', function (reasonCode, description) {
        if (username) {
            users.set(username, "offline", "status.status");
            console.log(username + " is now offline");
        } else console.log('no username')
    });
});

server.listen(3000, function () {
    console.log((new Date()) + ' Server is listening on port 3000');
});