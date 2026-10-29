# Pico に載せる lib/ のうち、MicroPython 専用のモジュールを使わないものをここで試す
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
