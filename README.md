# Simple WebSocket Server (TypeScript)

A simple WebSocket server written in TypeScript that integrates seamlessly with Laravel Broadcast. This server allows for real-time communication with your Laravel application.

## Features

-   **TypeScript**: Written entirely in TypeScript for type safety and better developer experience.
-   **Integration with Laravel Broadcast**: Easily integrates with Laravel's broadcasting system.
-   **IP Whitelisting/Blacklisting**: Control which IP addresses can connect to the WebSocket server.

## Prerequisites

Make sure you have the following tools globally installed on your system:

-   Node.js
-   TypeScript (`ts`)
-   ts-node (`ts-node`)
-   nodemon (`nodemon`)

You can install these globally using npm:

```bash
npm install -g typescript ts-node nodemon
```

Or using yarn:

```bash
yarn global add typescript ts-node nodemon
```

## Installation

1. **Clone the repository**:

    Clone the repository to your local machine:

    ```bash
    git clone https://github.com/naro-code-lab/Websocket-Server.git
    ```

2. **Install dependencies**:

    Navigate into the project directory and install the dependencies using npm or yarn:

    ```bash
    cd websocket-server
    npm install
    ```

    Or

    ```bash
    yarn install
    ```

3. **Environment Setup**:

    Create a `.env` file from the provided `.env.example`:

    ```bash
    cp .env.example .env
    ```

    In the `.env` file, configure the following settings:

    - `HOST`: The host for the WebSocket server (e.g., `localhost`).
    - `PORT`: The port number for the web server.
    - `WS_PORT`: The port number for the WebSocket server.

    Example `.env` configuration:

    ```dotenv
    HOST=localhost
    PORT=3000
    WS_PORT=6001
    ALLOWED_BROADCASTING_SERVER_IPS="*"
    BLACKLISTED_BROADCASTING_SERVER_IPS=""
    ```

4. **IP Whitelisting**:

    In the `.env` file, specify the IP addresses that are allowed to connect to the server. Separate multiple IPs with commas. For localhost, you can use:

    ```dotenv
    ALLOWED_BROADCASTING_SERVER_IPS=127.0.0.1,::ffff:127.0.0.1,::1,localhost
    ```

5. **IP Blacklisting**:

    Optionally, you can also blacklist IP addresses that are not allowed to connect:

    ```dotenv
    BLACKLISTED_BROADCASTING_SERVER_IPS=192.168.0.1
    ```

## Running the Server

To start the WebSocket server, run the following command:

```bash
npm run serve
```

Or with yarn:

```bash
yarn serve
```

Once the server is running, it will automatically listen for incoming WebSocket connections and broadcast events from Laravel. Ensure that your Laravel application is configured to use the WebSocket server for broadcasting.

## Contributing

Contributions are welcome! Please submit issues and pull requests for any improvements or bug fixes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
