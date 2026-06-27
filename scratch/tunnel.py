import subprocess
import sys
import time

print("Starting localtunnel...")
# Run npx lt --port 3000
proc = subprocess.Popen(
    ['npx', 'lt', '--port', '3000'],
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    bufsize=1
)

# Read stdout line by line
for line in proc.stdout:
    print(line, end='', flush=True)
    if "your url is" in line.lower():
        # Write url to file
        with open('/tmp/lt_url.txt', 'w') as f:
            f.write(line.strip())
        print("\n[tunnel] URL saved to /tmp/lt_url.txt. Keeping tunnel alive...", flush=True)

# If the loop finishes (process exited)
print("Localtunnel process exited.", flush=True)
