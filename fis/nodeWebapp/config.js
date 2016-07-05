var WEBFIS_CONFIG = {
    deploy: {
        // 前端编译过来的东西谁来接？
        receiver: 'http://127.0.0.1:8999/receiver',
        // 接收的文件夹，将会接受我们前端发过来的东西
        root: '/Users/mike/Documents/Github/NodeStudy/fis/nodeServer/'
    },
    roadmap: {
        domain: {
        test: '127.0.0.1:8000',//默认根目录
        online: '...'//线上cdn目录
        }
    }
}