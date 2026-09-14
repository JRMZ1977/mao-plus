/**
 * Script de Validación — MAO Tab Router Corregido
 * Ejecutar en DevTools (F12 → Console) después de recargar la aplicación
 */

function validateTabsRouter() {
  console.log('%c=== VALIDACIÓN DE TAB ROUTER ===', 'font-weight: bold; color: #2563EB;');

  // IDs que deberían existir en el DOM (extraídos del array TABS corregido)
  var expectedIds = [
    'fieldsetGestionProyectos',
    'sectionIdentificacion',
    'sectionModo',
    'sectionImagen',
    'sectionObj3D',
    'sectionEscala',
    'canvasMonofacial',
    'canvasBifacial',
    'individualObjectsContainer',
    'nuevoAnalisisBtnContainer',
    'sectionAnalisis3D',
    'morphologicalAnalysisContainer',
    'bifacialComparisonsSection',
    'resultadosPanel',
    'comparadorMultiObjetoSection'
  ];

  console.log('\n1. VERIFICACIÓN DE IDs EN EL DOM');
  console.log('   Esperados: ' + expectedIds.length + ' elementos');

  let foundCount = 0;
  let missingIds = [];

  expectedIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      console.log('   ✅ ' + id);
      foundCount++;
    } else {
      console.log('   ❌ ' + id + ' — NO ENCONTRADO');
      missingIds.push(id);
    }
  });

  console.log('\n   Resultado: ' + foundCount + '/' + expectedIds.length + ' encontrados');

  // Verificar tabbar
  console.log('\n2. VERIFICACIÓN DE TABBAR');
  var tabbar = document.getElementById('maoTabBar');
  if (tabbar) {
    console.log('   ✅ Tabbar inyectado en DOM');
    var parent = tabbar.parentElement;
    console.log('   ✅ Padre: <' + parent.tagName.toLowerCase() + ' class="' + parent.className + '">');

    // Verificar que sea .container (no body o main)
    if (parent.className.includes('container')) {
      console.log('   ✅ CORRECTO: Tabbar en .mao-main > .container');
    } else {
      console.log('   ⚠️  ADVERTENCIA: Tabbar en ' + parent.className + ' (esperado: container)');
    }
  } else {
    console.log('   ❌ Tabbar NO encontrado');
  }

  // Verificar que window.maoTabRouter exista
  console.log('\n3. VERIFICACIÓN DE API');
  if (window.maoTabRouter) {
    console.log('   ✅ API window.maoTabRouter disponible');
    var state = window.maoTabRouter.getState();
    console.log('   ✅ Estado actual:', state);
  } else {
    console.log('   ❌ API window.maoTabRouter NO disponible');
  }

  // Resultado final
  console.log('\n' + '='.repeat(40));
  if (foundCount === expectedIds.length && tabbar && window.maoTabRouter) {
    console.log('%c✅ VALIDACIÓN EXITOSA', 'font-weight: bold; color: #10B981;');
    console.log('El router debería funcionar correctamente.');
    console.log('Próximo paso: probar navegación de tabs en la UI.');
  } else {
    console.log('%c⚠️  VALIDACIÓN INCOMPLETA', 'font-weight: bold; color: #F59E0B;');
    if (missingIds.length > 0) {
      console.log('IDs faltantes: ' + missingIds.join(', '));
    }
    console.log('Revisar los problemas antes de continuar.');
  }
  console.log('='.repeat(40));
}

// Ejecutar automáticamente
console.log('%cEjecutando validación…', 'color: #6B7280;');
validateTabsRouter();
