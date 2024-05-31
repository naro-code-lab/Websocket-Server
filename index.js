const WebSocket = require("ws");
const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");

const app = express();
const wss = new WebSocket.Server({ port: process.env.WSPORT });

let subscriptions = {};

wss.on("connection", (ws, req) => {
	console.log(`Client connected`);

	ws.on("message", (message) => {
		const data = JSON.parse(Buffer.from(message).toString());

		if (!subscriptions[data.channel]) {
			subscriptions[data.channel] = new Array(1).fill(ws);
		} else {
			subscriptions[data?.channel].push(ws);
		}
	});

	ws.on("close", () => {
		if (ws.channel) {
			subscriptions[ws?.channel] = subscriptions[ws.channel].filter(
				(client) => client !== ws
			);
		}

		console.log("Client disconnected");
	});
});

app.use(bodyParser.json());

app.post("/", (req, res) => {
	const { channel, data, event } = req.body;

	subscriptions[channel?.name]?.forEach((ws) => {
		if (ws.readyState === WebSocket.OPEN) {
			let socket = data["socket"];

			delete data["socket"];

			console.log({ channel, data, event });

			ws.send(
				JSON.stringify({
					event: event,
					channel: channel,
					data,
					socket,
				})
			);
		}
	});

	res.sendStatus(200);
});

app.listen(8080, () => {
	console.log(
		`HTTP server is running on ${process.env.PROTOCOL}://${process.env.HOST}:${process.env.PORT}`
	);
});

console.log(
	`WebSocket server is running on ${
		process.env.PROTOCOL === "http" ? "ws" : "wss"
	}://${process.env.HOST}:${process.env.WSPORT}`
);
