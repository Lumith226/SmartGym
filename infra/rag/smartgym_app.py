from .app import app
from . import smartgym_cloud, smartgym_ollama_status

smartgym_cloud.register(app)
smartgym_ollama_status.register(app)
