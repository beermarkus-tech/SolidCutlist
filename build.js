const fs = require('fs');
const path = require('path');
const { minify } = require('html-minifier-terser');

// Point the script to your new Source and Distribution folders
const srcDir = path.join(__dirname, 'src'); 
const distDir = path.join(__dirname, 'dist');

const minifyOptions = {
    collapseWhitespace: true,
    removeComments: true,
    minifyJS: true,  
    minifyCSS: true  
};

// 1. Refresh the dist folder
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir);

// 2. Scan every file inside the 'src' folder
function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

// 3. Process and copy everything to 'dist'
async function build() {
    let failures = 0;
    const allFiles = getAllFiles(srcDir);

    for (const srcPath of allFiles) {
        // Calculate exact relative paths to flawlessly maintain your folder structure
        const relativePath = path.relative(srcDir, srcPath);
        const destPath = path.join(distDir, relativePath);

        // Build nested subfolders on the fly if they don't exist yet
        const destFolder = path.dirname(destPath);
        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder, { recursive: true });
        }

        const fileName = path.basename(srcPath);

        // If HTML, Minify! Else (js, gs, json), just copy it over natively!
        if (fileName.endsWith('.html')) {
            const rawHtml = fs.readFileSync(srcPath, 'utf8');
            try {
                const minifiedHtml = await minify(rawHtml, minifyOptions);
                fs.writeFileSync(destPath, minifiedHtml);
                console.log(`✅ Minified: ${relativePath}`);
            } catch (err) {
                console.error(`❌ Error minifying ${relativePath}:`, err);
                failures++;
            }
        } else {
            fs.copyFileSync(srcPath, destPath);
            console.log(`📄 Copied: ${relativePath}`);
        }
    }

    if (failures > 0) {
        // A half-minified dist must never be pushed: fail loudly
        console.error(`❌ Build FAILED: ${failures} file(s) could not be minified.`);
        process.exit(1);
    }
    console.log('🚀 Build complete! Check the "dist" folder.');
}

build().catch(err => { console.error('❌ Build crashed:', err); process.exit(1); });