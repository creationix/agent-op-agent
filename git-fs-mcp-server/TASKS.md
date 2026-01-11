# Tasks to do

These are large tasks that need to be completed for the git-fs-mcp-server project. They are organized by priority.

## Add Encantis IDE app

I have a half-designed programming language at

https://github.com/creationix/encantis

I need to build an IDE as a web app.  You will need to use the git-fs-mcp-server to build this app purely in browser space.

It should have:

- File explorer
- Text editor with syntax highlighting
- compiler to wat
- compiler from wat to wasm
- execution environment for wasm
- debugger for wasm

## Add N2 Playground App

Add a playground app for my N2 format

This is a bit more complex than Jot since it needs to have a file explorer and support multiple files.  Also it's a binary format so it needs to have a hex viewer and/or a structured viewer.

https://github.com/creationix/n2

## Add D2 Playground App

D2 should be a bit simpler since it's just text files.

https://github.com/creationix/d2

## Add Playground for my other formats

- https://github.com/creationix/jsonito
- https://github.com/creationix/nibs
