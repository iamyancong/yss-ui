#!/usr/bin/env python3
import os, sys, runpy

target = os.path.abspath(os.path.join(os.path.dirname(__file__), './skills/verify-no-secrets.py'))
runpy.run_path(target, run_name='__main__')
