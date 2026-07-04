const http = require('http');
const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/upload',
  method: 'POST',
  headers: {
    'Content-Type': 'multipart/form-data; boundary=---123'
  }
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
});
req.on('error', e => console.error(e));
req.write('-----123\r\nContent-Disposition: form-data; name="file"; filename="test.txt"\r\n\r\ntest\r\n-----123--\r\n');
req.end();
