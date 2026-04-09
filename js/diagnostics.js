// MAO Plus — Funciones de diagnóstico de consola

  // ============================================================================
  // 🧪 FUNCIONES DE DIAGNÓSTICO PARA CONSOLA
  // ============================================================================
  
  /**
   * 🧪 Diagnóstico completo de implementación de caché P/H
   * Ejecutar en consola: diagnosticarCachePH()
   */
  window.diagnosticarCachePH = function() {
    console.log('\n' + '='.repeat(80));
    console.log('🧪 DIAGNÓSTICO DE IMPLEMENTACIÓN - CACHÉ PERFORACIONES/HORADACIONES');
    console.log('='.repeat(80) + '\n');
    
    // 1. Verificar objetos en memoria
    console.log('📊 1. OBJETOS EN MEMORIA:');
    console.log(`   Total objetos: ${objects?.length || 0}`);
    
    if (!objects || objects.length === 0) {
      console.warn('   ⚠️ No hay objetos detectados. Detecte objetos primero.');
      return;
    }
    
    // 2. Verificar objetos con caché
    const objetosConCache = objects.filter(o => o.analisisCached);
    console.log(`   Objetos con caché: ${objetosConCache.length}`);
    
    if (objetosConCache.length === 0) {
      console.warn('   ⚠️ No hay objetos con caché. Ejecute "Analizar Forma" primero.');
      return;
    }
    
    // 3. Analizar cada objeto con caché
    objetosConCache.forEach((obj, idx) => {
      console.log(`\n📦 OBJETO ${idx + 1}/${objetosConCache.length}: ${obj.id}`);
      console.log(`   Cara: ${obj.cara || 'Mono'}`);
      
      // Verificar estructura del caché
      const cache = obj.analisisCached;
      console.log(`   ✓ Tiene caché: SÍ`);
      console.log(`   ✓ Timestamp: ${cache.timestamp}`);
      console.log(`   ✓ Canvas guardados: ${Object.keys(cache.canvasData || {}).length}`);
      
      // Verificar métricas en caché
      const metricas = cache.metricas;
      console.log(`   ✓ Métricas en caché: ${Object.keys(metricas || {}).length} propiedades`);
      
      // 🔍 VERIFICACIÓN CRÍTICA: P/H en métricas del caché
      const perfEnCache = metricas?.perforaciones || [];
      const horadEnCache = metricas?.horadaciones || [];
      
      console.log(`\n   🔍 PERFORACIONES EN CACHÉ:`);
      console.log(`      Total: ${perfEnCache.length}`);
      if (perfEnCache.length > 0) {
        const p0 = perfEnCache[0];
        console.log(`      Ejemplo P${p0.id}:`, {
          tieneMetricas: !!p0.metricas,
          propiedades: Object.keys(p0.metricas || {}).length,
          area: p0.metricas?.area,
          perimeter: p0.metricas?.perimeter,
          circularity: p0.metricas?.circularity,
          forma_detectada: p0.metricas?.forma_detectada,
          radio_max: p0.metricas?.radio_max
        });
      }
      
      console.log(`\n   🔍 HORADACIONES EN CACHÉ:`);
      console.log(`      Total: ${horadEnCache.length}`);
      if (horadEnCache.length > 0) {
        const h0 = horadEnCache[0];
        console.log(`      Ejemplo H${h0.id}:`, {
          tieneMetricas: !!h0.metricas,
          propiedades: Object.keys(h0.metricas || {}).length,
          area: h0.metricas?.area,
          perimeter: h0.metricas?.perimeter,
          circularity: h0.metricas?.circularity,
          forma_detectada: h0.metricas?.forma_detectada,
          radio_max: h0.metricas?.radio_max
        });
      }
      
      // 🔍 VERIFICACIÓN: P/H como propiedades del objeto
      const perfEnObj = obj.perforaciones || [];
      const horadEnObj = obj.horadaciones || [];
      
      console.log(`\n   🔍 PERFORACIONES COMO PROPIEDADES DEL OBJETO:`);
      console.log(`      Total: ${perfEnObj.length}`);
      
      console.log(`\n   🔍 HORADACIONES COMO PROPIEDADES DEL OBJETO:`);
      console.log(`      Total: ${horadEnObj.length}`);
      
      // ✅ VALIDACIÓN
      const cacheValido = perfEnCache.length > 0 && perfEnCache[0]?.metricas && 
                         Object.keys(perfEnCache[0].metricas).length > 5;
      
      if (cacheValido) {
        console.log(`\n   ✅ ESTADO: Caché VÁLIDO - Tabla comparativa FUNCIONARÁ`);
      } else if (perfEnCache.length === 0 && horadEnCache.length === 0) {
        console.log(`\n   ℹ️ ESTADO: Sin P/H - No se generará tabla comparativa`);
      } else {
        console.warn(`\n   ⚠️ ESTADO: Caché INCOMPLETO - Verificar estructura de métricas`);
      }
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ DIAGNÓSTICO COMPLETADO');
    console.log('='.repeat(80) + '\n');
  };
  
  /**
   * 🧪 Simular recuperación desde caché
   * Ejecutar en consola: simularRecuperacionCache(0)
   */
  window.simularRecuperacionCache = function(objectIndex = 0) {
    console.log('\n🔄 SIMULANDO RECUPERACIÓN DESDE CACHÉ...\n');
    
    if (!objects || objectIndex >= objects.length) {
      console.error(`❌ Índice inválido: ${objectIndex} (total objetos: ${objects?.length || 0})`);
      return;
    }
    
    const obj = objects[objectIndex];
    console.log(`📦 Objeto: ${obj.id}`);
    
    if (!obj.analisisCached) {
      console.warn(`⚠️ El objeto no tiene caché guardado`);
      return;
    }
    
    console.log(`✓ Caché encontrado`);
    
    // Simular extracción de métricas
    const metricasCached = obj.analisisCached.metricas;
    console.log(`✓ Métricas extraídas: ${Object.keys(metricasCached).length} propiedades`);
    
    // Simular restauración de P/H
    if (metricasCached.perforaciones && !obj.perforaciones) {
      obj.perforaciones = metricasCached.perforaciones;
      console.log(`✓ ${obj.perforaciones.length} perforaciones restauradas`);
    }
    
    if (metricasCached.horadaciones && !obj.horadaciones) {
      obj.horadaciones = metricasCached.horadaciones;
      console.log(`✓ ${obj.horadaciones.length} horadaciones restauradas`);
    }
    
    // Verificar que obj ahora tiene P/H
    console.log(`\n📊 VERIFICACIÓN POST-RESTAURACIÓN:`);
    console.log(`   obj.perforaciones: ${obj.perforaciones?.length || 0}`);
    console.log(`   obj.horadaciones: ${obj.horadaciones?.length || 0}`);
    
    if (obj.perforaciones?.length > 0) {
      console.log(`   Ejemplo P${obj.perforaciones[0].id}:`, {
        metricas: !!obj.perforaciones[0].metricas,
        propiedades: Object.keys(obj.perforaciones[0].metricas || {}).length
      });
    }
    
    console.log(`\n✅ Simulación completada - mostrarAnalisisMorfologico() ahora generará tabla comparativa`);
  };
  
  /**
   * 🧪 Verificar análisis cargado desde disco
   * Ejecutar en consola: verificarAnalisisDisco()
   */
  window.verificarAnalisisDisco = function() {
    console.log('\n💾 VERIFICANDO ANÁLISIS CARGADO DESDE DISCO...\n');
    
    if (!window.currentAnalysisData) {
      console.warn('⚠️ No hay análisis cargado en window.currentAnalysisData');
      console.log('   Abra un análisis desde el modal de colección primero.');
      return;
    }
    
    const analysis = window.currentAnalysisData;
    
    console.log(`📁 Análisis: ${analysis.nombreObjeto}`);
    console.log(`   ID: ${analysis.id}`);
    console.log(`   Timestamp: ${analysis.timestamp}`);
    
    console.log(`\n📊 MÉTRICAS:`);
    console.log(`   Total propiedades: ${Object.keys(analysis.metricas || {}).length}`);
    
    console.log(`\n🔵 PERFORACIONES:`);
    const perfs = analysis.perforaciones || [];
    console.log(`   Total: ${perfs.length}`);
    if (perfs.length > 0) {
      const p0 = perfs[0];
      console.log(`   Ejemplo P${p0.id}:`, {
        tieneMetricas: !!p0.metricas,
        propiedades: Object.keys(p0.metricas || {}).length,
        ejemploMetricas: {
          area: p0.metricas?.area,
          perimeter: p0.metricas?.perimeter,
          circularity: p0.metricas?.circularity,
          forma_detectada: p0.metricas?.forma_detectada
        }
      });
    }
    
    console.log(`\n🟢 HORADACIONES:`);
    const horads = analysis.horadaciones || [];
    console.log(`   Total: ${horads.length}`);
    if (horads.length > 0) {
      const h0 = horads[0];
      console.log(`   Ejemplo H${h0.id}:`, {
        tieneMetricas: !!h0.metricas,
        propiedades: Object.keys(h0.metricas || {}).length
      });
    }
    
    console.log(`\n🖼️ IMÁGENES:`);
    console.log(`   Rutas disponibles:`, Object.keys(analysis.imagenes || {}));
    
    console.log(`\n✅ Verificación completada`);
  };
  
  // Mensaje de bienvenida
  console.log('\n%c🧪 FUNCIONES DE DIAGNÓSTICO DISPONIBLES', 'color: #4a5568; font-size: 14px; font-weight: bold;');
  console.log('%cEjecute en consola:', 'color: #666; font-size: 12px;');
  console.log('%c  diagnosticarCachePH()', 'color: #28a745; font-weight: bold;', '- Verificar caché de P/H en objetos');
  console.log('%c  simularRecuperacionCache(0)', 'color: #28a745; font-weight: bold;', '- Simular recuperación de caché');
  console.log('%c  verificarAnalisisDisco()', 'color: #28a745; font-weight: bold;', '- Verificar análisis cargado desde disco\n');

