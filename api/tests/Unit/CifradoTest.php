<?php

namespace Tests\Unit;

use App\CopiasExternas\Cifrado;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * Las copias que salen del servidor viajan cifradas. Lo que se prueba acá es lo que un descuido convertiría en datos perdidos o
 * expuestos: que se recupere EXACTO lo cifrado, que sin la clave no se abra, y que una copia cortada o alterada no se acepte como buena.
 */
class CifradoTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir().DIRECTORY_SEPARATOR.'ccs-cifrado-'.bin2hex(random_bytes(4));
        mkdir($this->dir);
    }

    protected function tearDown(): void
    {
        array_map('unlink', glob($this->dir.'/*') ?: []);
        @rmdir($this->dir);
        parent::tearDown();
    }

    private function archivo(string $nombre, string $contenido): string
    {
        file_put_contents($this->dir.'/'.$nombre, $contenido);

        return $this->dir.'/'.$nombre;
    }

    /** @return array<string, array{int}> */
    public static function tamanos(): array
    {
        // con trozo de 100 bytes: vacío, chico, justo un trozo, justo dos, y con resto
        return ['vacío' => [0], 'chico' => [7], 'un trozo justo' => [100], 'dos trozos justos' => [200], 'con resto' => [457]];
    }

    #[DataProvider('tamanos')]
    public function test_lo_cifrado_se_recupera_exacto(int $bytes): void
    {
        $clave = Cifrado::nuevaClave();
        $original = $bytes ? random_bytes($bytes) : '';
        $plano = $this->archivo('plano', $original);

        Cifrado::cifrar($plano, $this->dir.'/enc', $clave, 100);
        Cifrado::descifrar($this->dir.'/enc', $this->dir.'/vuelta', $clave);

        $this->assertSame($original, file_get_contents($this->dir.'/vuelta'));
    }

    public function test_un_archivo_grande_con_el_trozo_por_defecto(): void
    {
        $clave = Cifrado::nuevaClave();
        $original = random_bytes(Cifrado::TROZO * 2 + 12345);
        $plano = $this->archivo('plano', $original);

        Cifrado::cifrar($plano, $this->dir.'/enc', $clave);
        Cifrado::descifrar($this->dir.'/enc', $this->dir.'/vuelta', $clave);

        $this->assertSame(hash('sha256', $original), hash_file('sha256', $this->dir.'/vuelta'));
    }

    public function test_lo_cifrado_no_deja_ver_el_contenido_y_dos_veces_da_distinto(): void
    {
        $clave = Cifrado::nuevaClave();
        $plano = $this->archivo('plano', str_repeat('INSERT INTO usuarios VALUES (1, "Administrador");', 50));

        Cifrado::cifrar($plano, $this->dir.'/a', $clave);
        Cifrado::cifrar($plano, $this->dir.'/b', $clave);

        $this->assertStringNotContainsString('usuarios', (string) file_get_contents($this->dir.'/a'));
        $this->assertNotSame(file_get_contents($this->dir.'/a'), file_get_contents($this->dir.'/b'));
    }

    public function test_con_otra_clave_no_se_abre_y_no_deja_un_archivo_a_medias(): void
    {
        $plano = $this->archivo('plano', random_bytes(500));
        Cifrado::cifrar($plano, $this->dir.'/enc', Cifrado::nuevaClave(), 100);

        $this->expectException(RuntimeException::class);
        try {
            Cifrado::descifrar($this->dir.'/enc', $this->dir.'/vuelta', Cifrado::nuevaClave());
        } finally {
            $this->assertFileDoesNotExist($this->dir.'/vuelta');
        }
    }

    /** @return array<string, array{string}> */
    public static function danos(): array
    {
        return ['un byte cambiado' => ['cambiar'], 'cortada a mitad de un trozo' => ['cortar'], 'sin el último trozo (corte justo)' => ['sin-ultimo'], 'trozos en otro orden' => ['reordenar'], 'sin cabecera' => ['sin-cabecera']];
    }

    #[DataProvider('danos')]
    public function test_una_copia_dañada_o_incompleta_no_se_acepta_como_buena(string $dano): void
    {
        $clave = Cifrado::nuevaClave();
        $plano = $this->archivo('plano', random_bytes(450));
        Cifrado::cifrar($plano, $this->dir.'/enc', $clave, 100);
        $c = (string) file_get_contents($this->dir.'/enc');
        $cabecera = 25;
        $marco = 100 + 16;

        $c = match ($dano) {
            'cambiar' => substr_replace($c, chr(ord($c[$cabecera + 5]) ^ 1), $cabecera + 5, 1),
            'cortar' => substr($c, 0, strlen($c) - 10),
            'sin-ultimo' => substr($c, 0, $cabecera + 4 * $marco),   // 4 trozos completos de los 5: parece un archivo entero
            'reordenar' => substr($c, 0, $cabecera).substr($c, $cabecera + $marco, $marco).substr($c, $cabecera, $marco).substr($c, $cabecera + 2 * $marco),
            'sin-cabecera' => substr($c, $cabecera),
        };
        file_put_contents($this->dir.'/roto', $c);

        $this->expectException(RuntimeException::class);
        Cifrado::descifrar($this->dir.'/roto', $this->dir.'/vuelta', $clave);
    }

    public function test_un_archivo_que_no_es_una_copia_se_dice_claro(): void
    {
        $this->archivo('cualquiera', 'esto no es una copia cifrada, es un texto cualquiera de más de veinticinco bytes');

        $this->expectExceptionMessage('no es una copia cifrada');
        Cifrado::descifrar($this->dir.'/cualquiera', $this->dir.'/vuelta', Cifrado::nuevaClave());
    }

    public function test_la_clave_tiene_que_ser_de_32_bytes(): void
    {
        $this->assertTrue(Cifrado::claveValida(Cifrado::nuevaClave()));
        $this->assertFalse(Cifrado::claveValida('corta'));
        $this->assertFalse(Cifrado::claveValida(base64_encode('solo-16-bytes!!!')));

        $this->expectException(\InvalidArgumentException::class);
        Cifrado::cifrar($this->archivo('p', 'x'), $this->dir.'/e', 'no-es-una-clave');
    }
}
