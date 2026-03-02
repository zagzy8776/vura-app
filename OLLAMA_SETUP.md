# Ollama Setup for VSCode with Cline

## Step 1: Install Ollama (if not already installed)
Download from: https://ollama.com/download

## Step 2: Download a Coding Model

Run one of these commands in your terminal:

### Option A: DeepSeek-Coder (Recommended - Strong for coding)
```
bash
ollama pull deepseek-coder
```

### Option B: CodeLlama (Good alternative)
```
bash
ollama pull codellama
```

### Option C: Smaller/faster model (if internet is slow)
```
bash
ollama pull llama3.2:1b
```

## Step 3: Start Ollama Server
```
bash
ollama serve
```

## Step 4: Configure Cline to Use Ollama

1. Open VSCode Settings
2. Search for "Cline" or "cline"
3. Find the "OpenAI API Base URL" setting
4. Set it to: `http://localhost:11434/v1`
5. Find the "OpenAI API Key" setting
6. Set it to: `ollama` (any dummy value works)

Alternatively, you can use the Cline Custom Model feature:
- Go to Cline settings
- Add custom model: `http://localhost:11434/v1/chat/completions`
- Model name: `deepseek-coder` (or whichever model you downloaded)

## Step 5: Verify It Works
```
bash
ollama list
```
You should see your downloaded model listed.

## Current Download Status
- Model: llama3.2:1b (1.3 GB)
- Progress: ~13% downloaded
- Speed: ~800 KB/s (variable)
- Estimated time: ~20-30 minutes remaining
