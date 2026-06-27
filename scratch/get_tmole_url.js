import tunnelmole from '../node_modules/tunnelmole/dist/src/tunnelmole.js';
import fs from 'fs';

console.log("Starting Tunnelmole programmatically on port 3000...");
tunnelmole({port: 3000}).then(url => {
    console.log("TUNNELMOLE_URL: " + url);
    fs.writeFileSync('/tmp/tmole_url.txt', url);
    console.log("URL saved to /tmp/tmole_url.txt");
}).catch(err => {
    console.error("Tunnelmole error:", err);
});
