import subprocess
import tempfile
import time
import platform

import portpicker
import pytest
import requests
from selenium import webdriver
from selenium.webdriver.firefox.options import Options

class GameServer:
    def __init__(self):
        self.port = portpicker.pick_unused_port()
        self.process = subprocess.Popen(
            ["cargo", "run", "--", f"127.0.0.1:{self.port}"],
        )

    def __enter__(self):
        time.sleep(0.5)
        for i in range(10):
            try:
                requests.get(f"http://127.0.0.1:{self.port}").raise_for_status()
            except:
                time.sleep(i ** 1.5)
        return self.port
    
    def __exit__(self, exc_type, exc_value, traceback):
        self.process.terminate()
        self.process.wait()

def new_isolated_firefox():
    """Create a fresh Firefox session with its own profile (isolated localStorage)."""
    profile_dir = tempfile.mkdtemp()
    options = Options()
    options.set_preference("profile", profile_dir)
    # check if macOS
    if platform.system() == "Darwin":
        # Check if Firefox nightly is available
        if subprocess.run(["/Applications/Firefox Nightly.app/Contents/MacOS/firefox", "--version"]).returncode == 0:
            options.binary_location = "/Applications/Firefox Nightly.app/Contents/MacOS/firefox"
    options.set_preference("browser.startup.homepage", "about:blank")
    return webdriver.Firefox(options=options)