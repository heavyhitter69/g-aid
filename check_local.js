const fs = require('fs');
const path = require('path');

const localUploadsDir = path.join(process.cwd(), '.tmp', 'local_uploads');
if (!fs.existsSync(localUploadsDir)) {
  console.log('No local_uploads directory found at', localUploadsDir);
} else {
  const getAllFiles = (dir) => {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) { 
            results = results.concat(getAllFiles(fullPath));
        } else { 
            results.push(fullPath);
        }
    });
    return results;
  };
  const files = getAllFiles(localUploadsDir);
  console.log('Files in local_uploads:');
  files.forEach(f => console.log(' - ' + path.relative(localUploadsDir, f)));
}
