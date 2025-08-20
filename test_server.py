#!/usr/bin/env python3
"""
Simple HTTP server for testing PDF Audio Storybook
Serves the public folder on localhost:8000
"""

import http.server
import socketserver
import os
import webbrowser
import sys

def main():
    PORT = 8000
    DIRECTORY = "public"
    
    # Check if public directory exists
    if not os.path.exists(DIRECTORY):
        print(f"❌ Directory '{DIRECTORY}' not found!")
        print("Make sure you're running this from the project root directory.")
        sys.exit(1)
    
    # Change to public directory
    os.chdir(DIRECTORY)
    
    # Create server
    Handler = http.server.SimpleHTTPRequestHandler
    
    # Custom handler to set proper MIME types
    class CustomHandler(Handler):
        def end_headers(self):
            self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
            self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
            super().end_headers()
        
        def guess_type(self, path):
            mimetype, encoding = super().guess_type(path)
            
            # Fix MIME types for our files
            if path.endswith('.js'):
                return 'application/javascript', encoding
            elif path.endswith('.wav'):
                return 'audio/wav', encoding
            elif path.endswith('.mp3'):
                return 'audio/mpeg', encoding
            elif path.endswith('.pdf'):
                return 'application/pdf', encoding
            elif path.endswith('.json'):
                return 'application/json', encoding
            
            return mimetype, encoding
    
    try:
        with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
            url = f"http://localhost:{PORT}"
            print(f"🚀 Starting server at {url}")
            print(f"📁 Serving directory: {os.getcwd()}")
            print(f"🌐 Open {url} in your browser")
            print("⏹️  Press Ctrl+C to stop the server")
            
            # Try to open browser automatically
            try:
                webbrowser.open(url)
                print("🌍 Browser opened automatically")
            except:
                print("🔧 Please open the URL manually in your browser")
            
            print("\n" + "="*50)
            
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except OSError as e:
        if e.errno == 10048:  # Address already in use
            print(f"❌ Port {PORT} is already in use!")
            print("Try closing other applications using this port or use a different port.")
        else:
            print(f"❌ Server error: {e}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    main()
