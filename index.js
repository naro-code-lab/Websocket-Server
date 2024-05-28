const WebSocket = require("ws");
const express = require("express");
const bodyParser = require("body-parser");
require("dotenv").config();

const axios = require("axios");

const app = express();
const wss = new WebSocket.Server({ port: process.env.WSPORT });

let subscriptions = {};

wss.on("connection", (ws) => {
	console.log("Client connected");

	ws.on("message", async (message) => {
		const data = JSON.parse(Buffer.from(message).toString());
		subscriptions[data.channel] = ws;
	});

	ws.on("close", () => {
		if (ws.channel) {
			subscriptions[ws.channel] = subscriptions[ws.channel].filter(
				(client) => client !== ws
			);
		}

		console.log("Client disconnected");
	});
});

app.use(bodyParser.json());

app.post("/", (req, res) => {
	const { channel, data, event } = req.body;

	let subscriptionConnection = subscriptions[channel?.name];

	if (subscriptionConnection) {
		if (subscriptionConnection.readyState === WebSocket.OPEN) {
			let socket = data["socket"];

			delete data["socket"];

			subscriptionConnection.send(
				JSON.stringify({
					event: event,
					channel: channel,
					data,
					socket,
				})
			);
		}
	}

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
