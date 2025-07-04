@echo off
echo クリーンビルドを実行しています...
if exist out rmdir /s /q out
mkdir out

echo TypeScriptをコンパイルしています...
call npx tsc -p ./

echo 拡張機能をパッケージングしています...
call npx vsce package

echo ビルド完了!
