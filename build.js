const fs = require('fs');
const path = require('path');
const { minify } = require('html-minifier-terser');

const distDir = path.join(__dirname, 'dist');

// The folders we want to scan (matching your screenshot)
const foldersToScan = ['Backend', 'Frontend'];

// Options to aggressively shrink your code
const minifyOptions = {
    collapseWhitespace: true,
    removeComments: true,
    minifyJS: true,  
    minifyCSS: true  
};

// 1. Create a fresh 'dist' folder (delete old one if it exists)
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir);

// 2. Recursive function to find all files in nested folders
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

// 3. Process the files
async function build() {
    let allFiles = [];
    foldersToScan.forEach(folder => {
        const fullFolderPath = path.join(__dirname, folder);
        if (fs.existsSync(fullFolderPath)) {
            allFiles = allFiles.concat(getAllFiles(fullFolderPath));
        }
    });

    for (const srcPath of allFiles) {
        // 🪄 FIX: Calculate the relative path so we can perfectly mirror it in dist
        const relativePath = path.relative(__dirname, srcPath);
        const destPath = path.join(distDir, relativePath);

        // 🪄 FIX: Create the nested subdirectories inside dist/ if they don't exist yet
        const destFolder = path.dirname(destPath);
        if (!fs.existsSync(destFolder)) {
            fs.mkdirSync(destFolder, { recursive: true });
        }

        const fileName = path.basename(srcPath);

        if (fileName.endsWith('.html')) {
            const rawHtml = fs.readFileSync(srcPath, 'utf8');
            try {
                const minifiedHtml = await minify(rawHtml, minifyOptions);
                fs.writeFileSync(destPath, minifiedHtml);
                console.log(`✅ Minified: ${relativePath}`); // Now prints the full path so you can see it working
            } catch (err) {
                console.error(`❌ Error minifying ${relativePath}:`, err);
            }
        } else if (fileName.endsWith('.gs') || fileName.endsWith('.js') || fileName.endsWith('.json')) {
            // Just copy Backend scripts as-is
            fs.copyFileSync(srcPath, destPath);
            console.log(`📄 Copied: ${relativePath}`);
        }
    }

    // Explicitly grab the appsscript.json manifest from the root folder
    const manifestSrc = path.join(__dirname, 'appsscript.json');
    const manifestDest = path.join(distDir, 'appsscript.json');
    
    if (fs.existsSync(manifestSrc)) {
        fs.copyFileSync(manifestSrc, manifestDest);
        console.log(`📄 Copied: appsscript.json`);
    } else {
        console.warn(`⚠️ WARNING: appsscript.json was not found in the root directory!`);
    }

    console.log('🚀 Build complete! Check the "dist" folder.');
}

build();