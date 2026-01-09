This project is for designing LLM-native encoding and retrieval systems.

It creates a test loop by testing all the designs on local models using lms-studio via tool call bridges.

This way it can propose alternative encoding formats to JSON and test the token count using a real LLM.

The host agent is a large SOTA model like Claude Opus 4.5, but the inner local model is something small like Qwen3-Coder-30b.  This way the agent doing the creative work is smart and powerful, but it's optimizing the designed for less powerful local models.

## Goals

Find better encodings for LLM-native retrieval systems as JSON alternatives.

Find better prompting and retrieval techniques for LLM-native retrieval systems.

Find better tool call syntaxes for LLM-native retrieval systems.

## Results

See the results folder for experiments and findings.