const http = require('http');
const { exec } = require('child_process');
const prettyMs = require('pretty-ms');

const gitScript = "ssh-agent bash -c 'ssh-add ~/.ssh/id_rsa; git pull && git submodule foreach git checkout master && git submodule foreach git pull'";

function processPost(request, response, callback) {
    var queryData = '';
    if (typeof callback !== 'function') return null;

    if (request.method == 'POST') {
        request.on('data', function (data) {
            queryData += data;
            if (queryData.length > 1e6) {
                queryData = '';
                response.writeHead(413, { 'Content-Type': 'text/plain' }).end();
                request.connection.destroy();
            }
        });

        request.on('end', function () {
            request.body = queryData;
            callback();
        });
    } else {
        response.writeHead(405, { 'Content-Type': 'text/plain' });
        response.end();
    }
}


http.createServer(function (request, response) {
    if (request.method == 'POST') {
        processPost(request, response, function () {
            let runPullRequest = false;
            let token = request.headers['x-gitlab-token'];
            let body = null;
            let commitTitle = "";

            let serverConfig = config.server.find(sv => sv.name === process.env.SERVER_NAME);
            if (!serverConfig) {
                console.log('This server is not config for webhook yet.');
                SendTelegramPost(serverConfig.chatId, config.telegram.warning, 'SERVER: ' + process.env.SERVER_NAME, 'This server is not config for webhook yet.');
                response.writeHead(204, 'OK', { 'Content-Type': 'text/plain' });
                response.end();
                return;
            }

            if (token === serverConfig.token) {
                try {
                    body = JSON.parse(request.body);
                } catch {
                    console.log('Parse request body failed!');
                }

                if (body && body.commits) {
                    for (let commit of body.commits) {
                        if ((commit.title.includes(config.magicCode) && commit.title.includes(serverConfig.name)) ||
                            (commit.message.includes(config.magicCode) && commit.message.includes(serverConfig.name))) {
                            runPullRequest = true;
                            commitTitle = commit.title;
                            break;
                        }
                    }
                }
            }

            if (runPullRequest) {
                let startTime = new Date().getTime();

                SendTelegramPost(serverConfig.chatId, config.telegram.info, `Received deploy request.`, commitTitle);
                console.log('Received deploy request.');

                let pullScript = `cd ${serverConfig.path} && ${gitScript} && bash ${serverConfig.path}/${serverConfig.syncFile}`;

                exec(pullScript, (error, stdout, stderr) => {
                    if (error) {
                        console.log('Deploy failed!');
                        console.log(`error: ${error.message}`);
                        SendTelegramPost(serverConfig.chatId, config.telegram.error, 'Deploy failed!', error.message);
                        return;
                    } else {
                        let processTime = prettyMs(new Date().getTime() - startTime, { formatSubMilliseconds: true })
                        console.log('Deploy successed!');
                        SendTelegramPost(serverConfig.chatId, config.telegram.success, 'Deploy successed!', `Processed time: <i>${processTime}</i>\nServer: ${serverConfig.name}`);
                    }

                    if (stdout) console.log(`stdout: ${stdout}`);
                    if (stderr) console.log(`stderr: ${stderr}`);
                });
            }

            response.writeHead(200, 'OK', { 'Content-Type': 'text/plain' });
            response.end();
        });
    } else {
        response.writeHead(200, 'OK', { 'Content-Type': 'text/plain' });
        response.end('Hi~');
    }
}).listen(8000);