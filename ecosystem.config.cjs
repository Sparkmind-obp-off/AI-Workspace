const origins = ['http://localhost:3000', process.env.WORKSPACE_PREVIEW_ORIGIN].filter(Boolean).join(',');
module.exports = {
  apps: [{
    name: 'webapp',
    script: 'node_modules/wrangler/bin/wrangler.js',
    args: `pages dev dist --d1 DB=00000000-0000-0000-0000-000000000001 --binding ALLOWED_ORIGIN=${origins} --ip 0.0.0.0 --port 3000`,
    cwd: '/home/user/webapp', env: { NODE_ENV: 'development' },
    watch: false, instances: 1, exec_mode: 'fork'
  }]
};
