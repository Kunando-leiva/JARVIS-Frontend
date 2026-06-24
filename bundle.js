import { statSync, readdirSync, readFileSync, existsSync, writeFileSync } from 'fs';
import { extname, relative, basename, join, sep } from 'path';
import { execSync } from 'child_process';

// ============================================
// 📦 EMPAQUETADOR DE CÓDIGO - JARVIS BUNDLER
// ============================================

// 🔧 CONFIGURACIÓN
const CONFIG = {
  // Directorios a incluir
  includeDirs: [
    '.',  // Directorio actual (Backend)
  
  ],
  
  // Extensiones de archivo a incluir
  extensions: ['.js', '.jsx', '.css', '.html', '.json', '.env.example'],
  
  // Archivos a ignorar (exactos)
  ignoreFiles: [
    'package-lock.json',
    'bundle.js',
    'proyecto_contexto.txt'
  ],
  
  // Directorios a ignorar
  ignoreDirs: [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.vscode',
    '.idea',
    '__pycache__',
    'temp',
    'temp_code',
    'custom_voices',
    'known_faces',
    'voices'
  ],
  
  // Patrones de archivos a ignorar
  ignorePatterns: [
    /\.backup_/,
    /\.log$/,
    /\.tmp$/,
    /\.cache$/,
    /\.map$/,
    /\.test\.js$/,
    /\.spec\.js$/,
    /\.min\.js$/,
    /\.bundle\.js$/
  ],
  
  // Límite de tamaño por archivo (en bytes)
  maxFileSize: 1024 * 500, // 500KB
  
  // Incluir archivos de configuración ocultos
  includeHidden: false
};

// ============================================
// 📝 FUNCIONES DE UTILIDAD
// ============================================

function getDirname() {
  return process.cwd();
}

function shouldIgnoreFile(filePath, fileName) {
  // Ignorar archivos por nombre exacto
  if (CONFIG.ignoreFiles.includes(fileName)) return true;
  
  // Ignorar por extensión o patrón
  for (const pattern of CONFIG.ignorePatterns) {
    if (pattern.test(fileName)) return true;
  }
  
  return false;
}

function shouldIgnoreDir(dirPath, dirName) {
  // Ignorar directorios por nombre
  if (CONFIG.ignoreDirs.includes(dirName)) return true;
  
  // Ignorar directorios ocultos (que empiezan con .)
  if (!CONFIG.includeHidden && dirName.startsWith('.')) return true;
  
  return false;
}

function shouldIncludeFile(fileName) {
  // Verificar extensión
  const ext = extname(fileName);
  return CONFIG.extensions.includes(ext);
}

function getFileInfo(filePath, baseDir) {
  const stats = statSync(filePath);
  const relativePath = relative(baseDir, filePath);
  const sizeKB = (stats.size / 1024).toFixed(2);
  
  return {
    path: relativePath,
    size: stats.size,
    sizeKB: sizeKB,
    extension: extname(filePath),
    name: basename(filePath)
  };
}

// ============================================
// 🔍 RECORRER DIRECTORIOS
// ============================================

function walkDirectory(dir, baseDir, fileList = []) {
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const stats = statSync(fullPath);
      
      if (stats.isDirectory()) {
        // Verificar si debemos ignorar este directorio
        if (shouldIgnoreDir(fullPath, item)) {
          console.log(`⏭️  Ignorando directorio: ${relative(baseDir, fullPath)}`);
          continue;
        }
        // Recursivamente recorrer subdirectorios
        walkDirectory(fullPath, baseDir, fileList);
      } else if (stats.isFile()) {
        // Verificar si debemos ignorar este archivo
        if (shouldIgnoreFile(fullPath, item)) {
          console.log(`⏭️  Ignorando archivo: ${relative(baseDir, fullPath)}`);
          continue;
        }
        
        // Verificar extensión
        if (!shouldIncludeFile(item)) {
          console.log(`⏭️  Extensión ignorada: ${relative(baseDir, fullPath)}`);
          continue;
        }
        
        // Verificar tamaño
        if (stats.size > CONFIG.maxFileSize) {
          console.log(`⚠️  Archivo muy grande (${(stats.size/1024/1024).toFixed(2)}MB): ${relative(baseDir, fullPath)}`);
          continue;
        }
        
        fileList.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`❌ Error al leer directorio ${dir}:`, error.message);
  }
  
  return fileList;
}

// ============================================
// 📄 LEER Y PROCESAR ARCHIVOS
// ============================================

function readFileContent(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`❌ Error al leer archivo ${filePath}:`, error.message);
    return null;
  }
}

function getProjectStructure(baseDir, files) {
  const structure = {};
  
  for (const file of files) {
    const relativePath = relative(baseDir, file);
    const parts = relativePath.split(sep);
    
    let current = structure;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = 'file';
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
  }
  
  return structure;
}

function formatStructure(structure, indent = '') {
  let result = '';
  const keys = Object.keys(structure).sort();
  
  for (const key of keys) {
    const value = structure[key];
    if (value === 'file') {
      result += `${indent}📄 ${key}\n`;
    } else {
      result += `${indent}📁 ${key}/\n`;
      result += formatStructure(value, indent + '  ');
    }
  }
  
  return result;
}

// ============================================
// 📝 GENERAR CONTENIDO DEL BUNDLE
// ============================================

function generateBundle(baseDir, files) {
  const lines = [];
  const separator = '='.repeat(80);
  
  // Título
  lines.push(separator);
  lines.push(`📦 PROYECTO JARVIS - BUNDLE DE CÓDIGO`);
  lines.push(`📅 Fecha: ${new Date().toISOString().split('T')[0]}`);
  lines.push(`📁 Directorio base: ${baseDir}`);
  lines.push(`📄 Archivos incluidos: ${files.length}`);
  lines.push(separator);
  lines.push('');
  
  // Estructura de carpetas
  lines.push('📂 ESTRUCTURA DEL PROYECTO');
  lines.push('-'.repeat(50));
  const structure = getProjectStructure(baseDir, files);
  lines.push(formatStructure(structure));
  lines.push('');
  lines.push(separator);
  lines.push('');
  
  // Contenido de archivos
  const totalFiles = files.length;
  let processedFiles = 0;
  
  for (const filePath of files) {
    const relativePath = relative(baseDir, filePath);
    const fileName = basename(filePath);
    const ext = extname(filePath).substring(1);
    
    processedFiles++;
    console.log(`📄 Procesando [${processedFiles}/${totalFiles}]: ${relativePath}`);
    
    const content = readFileContent(filePath);
    if (content === null) continue;
    
    // Determinar tipo de archivo para el marcador
    const fileType = ext || 'txt';
    const fileSize = (content.length / 1024).toFixed(2);
    
    lines.push(separator);
    lines.push(`📄 ARCHIVO: ${relativePath}`);
    lines.push(`📏 Tamaño: ${fileSize} KB`);
    lines.push(`📝 Tipo: ${fileType}`);
    lines.push(`📍 Ruta: ${filePath}`);
    lines.push(separator);
    lines.push('');
    lines.push(`\`\`\`${fileType}`);
    lines.push(content);
    lines.push('```');
    lines.push('');
  }
  
  // Pie de página
  lines.push(separator);
  lines.push('✅ BUNDLE GENERADO CORRECTAMENTE');
  lines.push(`📊 Total de archivos: ${files.length}`);
  lines.push(`📦 Tamaño estimado: ${(Buffer.byteLength(lines.join('\n'), 'utf-8') / 1024 / 1024).toFixed(2)} MB`);
  lines.push(separator);
  
  return lines.join('\n');
}

// ============================================
// 🚀 FUNCIÓN PRINCIPAL
// ============================================

function main() {
  console.log('🚀 INICIANDO EMPAQUETADOR DE CÓDIGO JARVIS');
  console.log('='.repeat(60));
  
  const rootDir = getDirname();
  console.log(`📁 Directorio raíz: ${rootDir}`);
  
  // Encontrar directorios a procesar
  const allFiles = [];
  
  for (const dirName of CONFIG.includeDirs) {
    const dirPath = join(rootDir, dirName);
    
    if (!existsSync(dirPath)) {
      console.log(`⚠️  Directorio no encontrado: ${dirName}`);
      continue;
    }
    
    console.log(`\n📂 Procesando: ${dirName}`);
    console.log('-'.repeat(40));
    
    const files = walkDirectory(dirPath, rootDir);
    allFiles.push(...files);
    console.log(`✅ ${files.length} archivos encontrados en ${dirName}`);
  }
  
  if (allFiles.length === 0) {
    console.error('❌ No se encontraron archivos para procesar');
    console.log('💡 Asegúrate de que los directorios existan y contengan archivos');
    return;
  }
  
  console.log(`\n📊 Total de archivos encontrados: ${allFiles.length}`);
  
  // Generar bundle
  console.log('\n📝 Generando bundle...');
  const bundleContent = generateBundle(rootDir, allFiles);
  
  // Guardar archivo
  const outputFile = join(rootDir, 'proyecto_contexto.txt');
  try {
    writeFileSync(outputFile, bundleContent, 'utf-8');
    const fileSize = (statSync(outputFile).size / 1024 / 1024).toFixed(2);
    console.log(`\n✅ BUNDLE GENERADO EXITOSAMENTE`);
    console.log(`📁 Archivo: ${outputFile}`);
    console.log(`📦 Tamaño: ${fileSize} MB`);
    console.log(`📊 Archivos incluidos: ${allFiles.length}`);
  } catch (error) {
    console.error('❌ Error al guardar el bundle:', error.message);
  }
}

// ============================================
// 🏃 EJECUTAR
// ============================================

main();