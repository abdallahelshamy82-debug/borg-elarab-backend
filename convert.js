const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '../backend/resources/views');
const destDir = path.join(__dirname, 'views');

function convertFile(srcFile, destFile) {
    if (!fs.existsSync(srcFile)) return;
    let content = fs.readFileSync(srcFile, 'utf8');

    content = content.replace(/\{\{ route\('(.+?)'\) \}\}/g, '/');
    content = content.replace(/\{\{ route\('(.+?)', (.*?)\) \}\}/g, '//');
    content = content.replace(/@csrf/g, '');
    content = content.replace(/\{\{ asset\('storage\/(.+?)'\) \}\}/g, '/storage/');
    content = content.replace(/\{\{ Auth::user\(\)->(.+?) \}\}/g, '<%= user. %>');
    
    content = content.replace(/@if\((.+?)\)/g, '<% if() { %>');
    content = content.replace(/@elseif\((.+?)\)/g, '<% } else if() { %>');
    content = content.replace(/@else/g, '<% } else { %>');
    content = content.replace(/@endif/g, '<% } %>');

    content = content.replace(/@forelse\((.+?) as (.+?)\)/g, '<% if( && .length > 0) { .forEach( => { %>');
    content = content.replace(/@empty/g, '<% }) } else { %>');
    content = content.replace(/@endforelse/g, '<% } %>');

    content = content.replace(/@foreach\((.+?) as (.+?)\)/g, '<% .forEach( => { %>');
    content = content.replace(/@endforeach/g, '<% }) %>');

    content = content.replace(/\{\{ (.+?) \}\}/g, '<%=  %>');

    content = content.replace(/Auth::check\(\)/g, 'user');
    content = content.replace(/user->isAdmin\(\)/g, 'user.is_admin');
    content = content.replace(/user->isDoctor\(\)/g, 'user.role === \'doctor\'');
    content = content.replace(/session\('success'\)/g, 'success');
    content = content.replace(/session\('error'\)/g, 'error');

    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    fs.writeFileSync(destFile, content);
}

const filesToConvert = [
    { src: 'PS.blade.php', dest: 'PS.ejs' },
    { src: 'paymob_mock.blade.php', dest: 'paymob_mock.ejs' },
    { src: 'new.blade.php', dest: 'new.ejs' }
];

filesToConvert.forEach(file => {
    convertFile(path.join(srcDir, file.src), path.join(destDir, file.dest));
});
